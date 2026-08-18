/**
 * "Connections" item-pane section: shows which mindmap the current item or
 * note belongs to, lists its existing links, offers an "Add link" action
 * (see addLinkForm.ts) to create a new one, and lets the user remove the
 * node or a single link from the mindmap (without touching the underlying
 * Zotero item/note). `renderConnectionsContent` is a plain function (not
 * tied to the ItemPaneManager hook shape) so a future docked side-panel
 * mount can call it directly.
 *
 * The add-link action reaches the same form from two entry points: the "+"
 * in the section header (the item-pane mount, matching Tags/Related) and an
 * in-body button (the docked mount, which has no header of its own).
 */
import { getLocaleID } from "../../utils/locale";
import {
  findAllMindmapNotes,
  listMindmaps,
  readDocumentFromNote,
  readMindmapDocument,
  refreshNote,
  updateMindmapDocument,
  type MindmapSummary,
} from "./storage";
import { pruneDanglingExternalNodes } from "./crossMindmapCleanup";
import {
  getLinkTypeById,
  UNKNOWN_TYPE_LABEL,
  type LinkType,
} from "./linkTypes";
import { MISSING_ITEM_LABEL, resolveNodeLabel } from "./nodeLabels";
import { appendL10nButton, appendMindmapOptions } from "./uiElements";
import { renderAddLinkForm } from "./addLinkForm";
import {
  canBeMindmapNode,
  refFor,
  removeFromGroup,
  removeLink,
  removeNode,
} from "./mutations";
import { refsMatch, type MindmapDocument, type MindmapNode } from "./schema";

const PANE_ID = "zotero-linked-mindmaps-connections";

/**
 * Matches the button type Zotero's own Tags/Related sections use, so the
 * header "+" lands in the same slot and inherits the same styling.
 */
const ADD_BUTTON_TYPE = "add";

let registeredPaneID: string | false = false;

export class ConnectionsPanelFactory {
  static register() {
    registeredPaneID = Zotero.ItemPaneManager.registerSection({
      paneID: PANE_ID,
      pluginID: addon.data.config.addonID,
      header: {
        l10nID: getLocaleID("item-mindmaps-section-head-text"),
        icon: "chrome://zotero/skin/16/universal/link.svg",
      },
      sidenav: {
        l10nID: getLocaleID("item-mindmaps-section-sidenav-tooltip"),
        // Zotero ships no 20px icon that means "linked items", so this one is
        // the plugin's own, drawn to the same conventions: filled shapes that
        // take their colour from context-fill and so follow light and dark.
        icon: `chrome://${addon.data.config.addonRef}/content/icons/mindmaps-20.svg`,
      },
      sectionButtons: [
        {
          type: ADD_BUTTON_TYPE,
          // Rendered via -moz-context-properties/fill: currentColor, so this
          // one icon tracks both light and dark themes.
          icon: "chrome://zotero/skin/16/universal/plus.svg",
          l10nID: getLocaleID("item-mindmaps-add-link-header-button"),
          onClick: ({ body, item }) => {
            expandSection(body);
            openAddLinkForm(body, item);
          },
        },
      ],
      onItemChange: ({ item, setEnabled }) => {
        setEnabled(canBeMindmapNode(item));
        return true;
      },
      onRender: ({ body }) => {
        body.textContent = "";
      },
      onAsyncRender: async ({ body, item }) => {
        await renderConnectionsContent(body, item);
      },
    });
  }

  static unregister() {
    if (!registeredPaneID) {
      Zotero.debug(
        "[zoteroLinkedMindmaps] Connections section was never registered; skipping unregister",
      );
      return;
    }
    Zotero.ItemPaneManager.unregisterSection(registeredPaneID);
    registeredPaneID = false;
  }
}

function appendL10nText(container: HTMLElement, doc: Document, id: string) {
  const el = doc.createElement("div");
  el.classList.add("mindmap-empty");
  el.setAttribute("data-l10n-id", id);
  container.appendChild(el);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A stroked path in its own 16x16 box, sized and coloured by the sheet. */
function appendGlyph(parent: Element, doc: Document, path: string): void {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const line = doc.createElementNS(SVG_NS, "path");
  line.setAttribute("d", path);
  svg.appendChild(line);
  parent.appendChild(svg);
}

/**
 * The line the graph draws for this type, at row scale: dashed with an
 * arrowhead for a directional type, solid for an undirected one, dotted for a
 * type no longer in the vocabulary. Same three cases the renderer's stylesheet
 * encodes, so a link reads the same way in the panel and on the graph.
 *
 * This says what the type looks like, not which way this particular link
 * points - that is the separator's job, and the two are different facts.
 */
function appendTypeGlyph(
  parent: Element,
  doc: Document,
  type: LinkType | undefined,
): void {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "6");
  svg.setAttribute("viewBox", "0 0 16 6");
  svg.setAttribute("aria-hidden", "true");

  const line = doc.createElementNS(SVG_NS, "path");
  line.setAttribute("stroke-width", "1.4");
  line.setAttribute("fill", "none");

  if (!type) {
    line.setAttribute("d", "M0 3h14");
    line.setAttribute("stroke-dasharray", "1 2");
  } else if (type.directional) {
    line.setAttribute("d", "M0 3h9");
    line.setAttribute("stroke-dasharray", "3 2");
    const head = doc.createElementNS(SVG_NS, "path");
    head.setAttribute("d", "M9 0.8L13 3l-4 2.2z");
    head.setAttribute("fill", "currentColor");
    head.setAttribute("stroke", "none");
    svg.appendChild(line);
    svg.appendChild(head);
    parent.appendChild(svg);
    return;
  } else {
    line.setAttribute("d", "M0 3h14");
  }

  svg.appendChild(line);
  parent.appendChild(svg);
}

const ADD_LINK_FORM_CLASS = "mindmap-add-link-form";
const FORM_MINDMAP_ATTRIBUTE = "data-mindmap-id";

/**
 * True where the panel has no section header to hang a "+" on. The item-pane
 * mount sits inside a `collapsible-section` and opens the form from its header
 * button; the docked mount in the mindmap tab is a bare container, so it needs
 * an in-body button of its own.
 */
function needsInBodyAddButton(container: HTMLElement): boolean {
  return !container.closest("collapsible-section");
}

/**
 * Appends the (initially hidden, lazily loaded) add-link form container to
 * `container`, preceded by an "Add link" toggle button on mounts that have no
 * header button. The mindmap document is only read once the user actually
 * opens the form, so simply viewing the panel never creates a mindmap note as
 * a side effect.
 */
function appendAddLinkSection(
  container: HTMLElement,
  doc: Document,
  item: Zotero.Item,
  mindmapId?: string,
) {
  const wrapper = doc.createElement("div");

  const formContainer = doc.createElement("div");
  formContainer.classList.add(ADD_LINK_FORM_CLASS);
  formContainer.style.display = "none";
  // Recorded on the element rather than kept in this closure because the form
  // is opened from three places and only one of them can reach a closure here:
  // this button, the section header's "+" (which the item pane calls with
  // nothing but the body element), and the graph's right-click menu.
  if (mindmapId !== undefined) {
    formContainer.setAttribute(FORM_MINDMAP_ATTRIBUTE, mindmapId);
  }

  if (needsInBodyAddButton(container)) {
    appendL10nButton(wrapper, "add-link-button", () => {
      if (formContainer.style.display === "none") {
        openAddLinkForm(container, item, mindmapId);
      } else {
        formContainer.style.display = "none";
      }
    });
  }

  wrapper.appendChild(formContainer);
  container.appendChild(wrapper);
}

/**
 * Reveals the add-link form inside an already-rendered panel, loading it on
 * first use. No-op while the panel is still rendering or when it is showing an
 * error state, since neither has a form container yet.
 *
 * Falls back to the mindmap the panel drew, so a caller that has no id of its
 * own - the section header's "+" - still lands on the mindmap the user is
 * looking at rather than being asked to name it again.
 */
function openAddLinkForm(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapId?: string,
) {
  const formContainer = container.querySelector<HTMLElement>(
    `.${ADD_LINK_FORM_CLASS}`,
  );
  if (!formContainer) {
    return;
  }
  formContainer.style.display = "";
  if (formContainer.childElementCount === 0) {
    void loadAddLinkForm(
      formContainer,
      item,
      container,
      mindmapId ??
        formContainer.getAttribute(FORM_MINDMAP_ATTRIBUTE) ??
        undefined,
    );
  }
}

/**
 * Opens the collapsible section the panel body sits in, so a header-button
 * click on a collapsed section reveals the form it just opened.
 */
function expandSection(body: HTMLElement) {
  const section = body.closest("collapsible-section") as
    (Element & { open: boolean }) | null;
  if (section) {
    section.open = true;
  }
}

export const MINDMAP_CHOICE_CLASS = "mindmap-choose-target";

/**
 * Asks which mindmap the link belongs in before the form appears, but only
 * when the answer isn't already obvious: with one mindmap it is used
 * implicitly, and with none the default one is created on save, exactly as
 * before. Creating a mindmap is the tab's job, so this only ever lists what
 * already exists.
 *
 * `mindmapId` is the answer already given - the graph the panel is docked
 * beside, or the mindmap the panel resolved for this item. Asking again there
 * would be asking the user to re-state what they are already looking at.
 */
async function loadAddLinkForm(
  formContainer: HTMLElement,
  item: Zotero.Item,
  panelContainer: HTMLElement,
  mindmapId?: string,
) {
  try {
    if (mindmapId !== undefined) {
      await mountAddLinkForm(formContainer, item, panelContainer, mindmapId);
      return;
    }
    const mindmaps = await listMindmaps(item.libraryID);
    if (mindmaps.length > 1) {
      renderMindmapChoice(formContainer, item, panelContainer, mindmaps);
      return;
    }
    await mountAddLinkForm(
      formContainer,
      item,
      panelContainer,
      mindmaps[0]?.id,
    );
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] Add-link form failed to load mindmap document: ${
        (err as Error).message
      }`,
    );
    appendL10nText(
      formContainer,
      formContainer.ownerDocument!,
      getLocaleID("item-mindmaps-error-state"),
    );
  }
}

function renderMindmapChoice(
  formContainer: HTMLElement,
  item: Zotero.Item,
  panelContainer: HTMLElement,
  mindmaps: MindmapSummary[],
) {
  const doc = formContainer.ownerDocument!;
  formContainer.textContent = "";

  const wrapper = doc.createElement("div");
  wrapper.classList.add(MINDMAP_CHOICE_CLASS);

  appendL10nText(
    wrapper,
    doc,
    getLocaleID("item-mindmaps-choose-mindmap-label"),
  );

  const picker = doc.createElement("select");
  appendMindmapOptions(picker, mindmaps);
  wrapper.appendChild(picker);

  appendL10nButton(wrapper, "item-mindmaps-choose-mindmap-continue", () => {
    void mountAddLinkForm(formContainer, item, panelContainer, picker.value);
  });

  formContainer.appendChild(wrapper);
}

async function mountAddLinkForm(
  formContainer: HTMLElement,
  item: Zotero.Item,
  panelContainer: HTMLElement,
  mindmapId: string | undefined,
) {
  const mindmapDoc = await readMindmapDocument(mindmapId, item.libraryID);
  formContainer.textContent = "";
  renderAddLinkForm(formContainer, item, mindmapDoc, () => {
    // Redraws against the mindmap the form just wrote to. Without it the
    // panel would resolve the item's mindmap from scratch and could land on a
    // different one, so the link the user just saved would vanish.
    void renderConnectionsContent(panelContainer, item, mindmapDoc.id);
  });
}

/** What the panel found to show, and whether anything was unreadable. */
interface PanelMembership {
  id: string;
  title: string;
}

interface PanelMindmap {
  doc: MindmapDocument | null;
  unreadable: boolean;
  /** Every mindmap the item is a node in, for the panel's picker. */
  memberships: PanelMembership[];
}

/**
 * The mindmap to show for `item`: the one `preferredId` names when the caller
 * knows it, otherwise the first one holding a node for the item.
 *
 * Reads every storage note rather than only the library's first. An item can
 * be a node in any mindmap, and taking the lowest-numbered note makes every
 * other mindmap's links invisible from the panel.
 *
 * Notes are reloaded before parsing because the panel redraws straight after
 * its own write, which is exactly when a note's cached text lags. A note that
 * won't parse is skipped rather than failing the lookup - one corrupt mindmap
 * must not hide the item's links in the others - but it is reported back, so
 * finding nothing at all after skipping one shows the error state rather than
 * claiming the item is in no mindmap.
 */
async function findMindmapForItem(
  item: Zotero.Item,
  preferredId: string | undefined,
): Promise<PanelMindmap> {
  const ref = refFor(item);
  let preferred: MindmapDocument | null = null;
  let holding: MindmapDocument | null = null;
  let unreadable = false;
  const memberships: PanelMembership[] = [];
  // Every note is read even once the preferred one is found, because the
  // picker has to offer the item's other memberships and only this walk knows
  // what they are.
  for (const note of await findAllMindmapNotes(item.libraryID)) {
    let candidate: MindmapDocument;
    try {
      candidate = readDocumentFromNote(await refreshNote(note));
    } catch (err) {
      unreadable = true;
      Zotero.debug(
        `[zoteroLinkedMindmaps] Connections panel skipping unreadable storage note ${
          note.id
        }: ${(err as Error).message}`,
      );
      continue;
    }
    const holds = candidate.nodes.some((node) => refsMatch(node.ref, ref));
    if (holds) {
      memberships.push({ id: candidate.id, title: candidate.title });
    }
    if (candidate.id === preferredId) {
      preferred = candidate;
    }
    if (!holding && holds) {
      holding = candidate;
    }
  }
  return { doc: preferred ?? holding, unreadable, memberships };
}

/**
 * Renders the Connections panel content for `item` into `container`: the
 * mindmap the item belongs to (if any), its existing links (each with a
 * remove control), a remove-node control, and an "Add link" action.
 *
 * `mindmapId` pins the panel to one mindmap - the graph the dock hangs off,
 * or the one the add-link form just wrote to. Left out, the panel picks the
 * first mindmap the item is a node in.
 *
 * `openAddLink` reveals the add-link form as part of the same render, which is
 * what the graph's right-click menu wants: the menu's one action should land
 * on the form, not on a panel with a button that opens it.
 */
export async function renderConnectionsContent(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapId?: string,
  openAddLink = false,
): Promise<void> {
  const shown = await renderPanelBody(container, item, mindmapId);
  // After the body, because the form container it reveals is part of what the
  // body draws. A no-op on the error state, which has no form to open.
  if (openAddLink) {
    openAddLinkForm(container, item, shown);
  }
}

/**
 * Draws the panel and reports which mindmap it ended up showing, so the
 * add-link form targets that one rather than resolving the item's mindmap a
 * second time and possibly landing elsewhere. Undefined means the panel found
 * no mindmap to show - the form then falls back to asking.
 */
async function renderPanelBody(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapId?: string,
): Promise<string | undefined> {
  const doc = container.ownerDocument!;
  container.textContent = "";

  if (!canBeMindmapNode(item)) {
    return undefined;
  }

  let found: PanelMindmap;
  try {
    found = await findMindmapForItem(item, mindmapId);
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] Connections panel failed to read mindmap document: ${
        (err as Error).message
      }`,
    );
    appendL10nText(container, doc, getLocaleID("item-mindmaps-error-state"));
    return undefined;
  }

  if (!found.doc) {
    appendL10nText(
      container,
      doc,
      getLocaleID(
        found.unreadable
          ? "item-mindmaps-error-state"
          : "item-mindmaps-empty-state",
      ),
    );
    if (!found.unreadable) {
      appendAddLinkSection(container, doc, item, mindmapId);
    }
    return mindmapId;
  }
  const mindmapDoc = found.doc;

  const ref = refFor(item);
  const node = mindmapDoc.nodes.find((candidate) =>
    refsMatch(candidate.ref, ref),
  );
  if (!node) {
    appendL10nText(container, doc, getLocaleID("item-mindmaps-empty-state"));
    appendAddLinkSection(container, doc, item, mindmapDoc.id);
    return mindmapDoc.id;
  }

  const current = doc.createElement("div");
  current.classList.add("mindmap-current");
  // A picker only where there is something to pick: an item in one mindmap
  // gets its name as plain text rather than a control that cannot go
  // anywhere.
  if (found.memberships.length > 1) {
    const picker = doc.createElement("select");
    picker.classList.add("mindmap-current-picker");
    picker.setAttribute(
      "data-l10n-id",
      getLocaleID("item-mindmaps-current-label"),
    );
    for (const membership of found.memberships) {
      const option = doc.createElement("option");
      option.value = membership.id;
      option.textContent = membership.title;
      picker.appendChild(option);
    }
    picker.value = mindmapDoc.id;
    picker.addEventListener("change", () => {
      void renderConnectionsContent(container, item, picker.value);
    });
    current.appendChild(picker);
  } else {
    const name = doc.createElement("span");
    name.classList.add("mindmap-current-picker");
    name.textContent = mindmapDoc.title;
    current.appendChild(name);
  }

  const removeNode = appendL10nButton(
    current,
    "item-mindmaps-remove-node-button",
    () => {
      void handleRemoveNode(container, item, mindmapDoc, node.id);
    },
  );
  removeNode.classList.add("mindmap-icon-button");
  appendGlyph(removeNode, doc, "M4 8h8");
  container.appendChild(current);

  // Only offered when the node is actually in a group: this is where a single
  // node leaves one, as opposed to dissolving the whole group from the graph.
  if (node.groupId) {
    appendL10nButton(
      container,
      "item-mindmaps-remove-from-group-button",
      () => {
        void handleRemoveFromGroup(container, item, mindmapDoc, node.id);
      },
    );
  }

  const links = mindmapDoc.links.filter(
    (link) => link.sourceNodeId === node.id || link.targetNodeId === node.id,
  );
  if (links.length === 0) {
    appendL10nText(container, doc, getLocaleID("item-mindmaps-no-links-state"));
    appendAddLinkSection(container, doc, item, mindmapDoc.id);
    return mindmapDoc.id;
  }

  const list = doc.createElement("ul");
  list.classList.add("mindmap-links");
  for (const link of links) {
    const isSource = link.sourceNodeId === node.id;
    const otherNodeId = isSource ? link.targetNodeId : link.sourceNodeId;
    const otherNode = mindmapDoc.nodes.find((n) => n.id === otherNodeId);
    const otherTitle = otherNode
      ? resolveNodeLabel(otherNode.ref)
      : MISSING_ITEM_LABEL;

    const linkType = getLinkTypeById(link.typeId);
    // Matches how the graph names a link, so the same relation does not read
    // two different ways depending on which surface you are looking at.
    const typeText = linkType
      ? link.name
        ? `${linkType.label}: ${link.name}`
        : linkType.label
      : UNKNOWN_TYPE_LABEL;

    // The separator carries the direction, so an arrow on a row always means
    // an authored one. An undirected link gets a neutral mark instead. This
    // is the link's own orientation; the chip beside it shows the type's
    // rendering, which is a different fact.
    let separator = "·";
    if (link.direction) {
      const pointsAway = (link.direction === "forward") === isSource;
      separator = pointsAway ? "→" : "←";
    }

    const li = doc.createElement("li");
    li.classList.add("mindmap-link-row");

    const chip = doc.createElement("span");
    chip.classList.add("mindmap-link-type");
    appendTypeGlyph(chip, doc, linkType);
    const chipLabel = doc.createElement("span");
    chipLabel.classList.add("mindmap-link-type-label");
    chipLabel.textContent = typeText;
    chip.appendChild(chipLabel);
    chip.title = typeText;
    li.appendChild(chip);

    const arrow = doc.createElement("span");
    arrow.classList.add("mindmap-link-arrow");
    arrow.textContent = separator;
    li.appendChild(arrow);

    const target = doc.createElement("span");
    target.classList.add("mindmap-link-target");
    target.textContent = otherTitle;
    target.title = otherTitle;
    li.appendChild(target);

    const remove = appendL10nButton(
      li,
      "item-mindmaps-remove-link-button",
      () => {
        void handleRemoveLink(container, item, mindmapDoc, link.id);
      },
    );
    remove.classList.add("mindmap-icon-button", "mindmap-link-remove");
    appendGlyph(remove, doc, "M4.5 4.5l7 7M11.5 4.5l-7 7");

    list.appendChild(li);
  }
  container.appendChild(list);
  appendAddLinkSection(container, doc, item, mindmapDoc.id);
  return mindmapDoc.id;
}

/**
 * Applies a change to the mindmap behind the panel and redraws it.
 *
 * `mutate` runs against the document as it stands at write time, not the copy
 * the panel rendered from: the panel can sit open while other edits land. A
 * failed write is logged and swallowed rather than thrown, and the redraw
 * happens either way, so the panel always ends up showing what is actually
 * stored rather than a half-applied change.
 */
async function applyToMindmap(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapDoc: MindmapDocument,
  what: string,
  mutate: (doc: MindmapDocument) => void,
  after?: () => Promise<unknown>,
): Promise<void> {
  try {
    await updateMindmapDocument(
      (doc) => {
        mutate(doc);
        return doc;
      },
      mindmapDoc.id,
      item.libraryID,
    );
    await after?.();
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] Connections panel failed to ${what}: ${
        (err as Error).message
      }`,
    );
  }
  // Stays on the mindmap the change was made to, even when the change was
  // removing the item's last node from it - the panel then correctly reads as
  // empty for that mindmap rather than jumping to another one.
  await renderConnectionsContent(container, item, mindmapDoc.id);
}

function handleRemoveNode(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapDoc: MindmapDocument,
  nodeId: string,
): Promise<void> {
  return applyToMindmap(
    container,
    item,
    mindmapDoc,
    "remove node",
    (doc) => removeNode(doc, nodeId),
    // Another mindmap may have been reaching into the node just removed.
    // Nothing records that, by design, so the stubs are reconciled against
    // what still exists.
    () => pruneDanglingExternalNodes(item.libraryID),
  );
}

function handleRemoveFromGroup(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapDoc: MindmapDocument,
  nodeId: string,
): Promise<void> {
  return applyToMindmap(
    container,
    item,
    mindmapDoc,
    "remove node from group",
    (doc) => removeFromGroup(doc, nodeId),
  );
}

function handleRemoveLink(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapDoc: MindmapDocument,
  linkId: string,
): Promise<void> {
  return applyToMindmap(container, item, mindmapDoc, "remove link", (doc) =>
    removeLink(doc, linkId),
  );
}
