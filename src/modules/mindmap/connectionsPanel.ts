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
  findMindmapNote,
  listMindmaps,
  readDocumentFromNote,
  readMindmapDocument,
  refreshNote,
  updateMindmapDocument,
  type MindmapSummary,
} from "./storage";
import { pruneDanglingExternalNodes } from "./crossMindmapCleanup";
import { getLinkTypeById } from "./linkTypes";
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
        l10nID: getLocaleID("connections-section-head-text"),
        icon: "chrome://zotero/skin/16/universal/book.svg",
      },
      sidenav: {
        l10nID: getLocaleID("connections-section-sidenav-tooltip"),
        icon: "chrome://zotero/skin/20/universal/save.svg",
      },
      sectionButtons: [
        {
          type: ADD_BUTTON_TYPE,
          // Rendered via -moz-context-properties/fill: currentColor, so this
          // one icon tracks both light and dark themes.
          icon: "chrome://zotero/skin/16/universal/plus.svg",
          l10nID: getLocaleID("connections-add-link-header-button"),
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
  el.setAttribute("data-l10n-id", id);
  container.appendChild(el);
}

const ADD_LINK_FORM_CLASS = "mindmap-add-link-form";

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
) {
  const wrapper = doc.createElement("div");

  const formContainer = doc.createElement("div");
  formContainer.classList.add(ADD_LINK_FORM_CLASS);
  formContainer.style.display = "none";

  if (needsInBodyAddButton(container)) {
    appendL10nButton(wrapper, "add-link-button", () => {
      if (formContainer.style.display === "none") {
        openAddLinkForm(container, item);
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
 */
function openAddLinkForm(container: HTMLElement, item: Zotero.Item) {
  const formContainer = container.querySelector<HTMLElement>(
    `.${ADD_LINK_FORM_CLASS}`,
  );
  if (!formContainer) {
    return;
  }
  formContainer.style.display = "";
  if (formContainer.childElementCount === 0) {
    void loadAddLinkForm(formContainer, item, container);
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
 */
async function loadAddLinkForm(
  formContainer: HTMLElement,
  item: Zotero.Item,
  panelContainer: HTMLElement,
) {
  try {
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
      getLocaleID("connections-error-state"),
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

  appendL10nText(wrapper, doc, getLocaleID("connections-choose-mindmap-label"));

  const picker = doc.createElement("select");
  appendMindmapOptions(picker, mindmaps);
  wrapper.appendChild(picker);

  appendL10nButton(wrapper, "connections-choose-mindmap-continue", () => {
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
    void renderConnectionsContent(panelContainer, item);
  });
}

/**
 * Renders the Connections panel content for `item` into `container`: the
 * mindmap the item belongs to (if any), its existing links (each with a
 * remove control), a remove-node control, and an "Add link" action.
 */
export async function renderConnectionsContent(
  container: HTMLElement,
  item: Zotero.Item,
): Promise<void> {
  const doc = container.ownerDocument!;
  container.textContent = "";

  if (!canBeMindmapNode(item)) {
    return;
  }

  const note = await findMindmapNote(item.libraryID);
  if (!note) {
    appendL10nText(container, doc, getLocaleID("connections-empty-state"));
    appendAddLinkSection(container, doc, item);
    return;
  }

  let mindmapDoc: MindmapDocument;
  try {
    // Parses the note found just above rather than resolving one again: the
    // id-less read would repeat the same search, and would create a note as a
    // side effect of merely viewing the panel.
    mindmapDoc = readDocumentFromNote(await refreshNote(note));
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] Connections panel failed to read mindmap document: ${
        (err as Error).message
      }`,
    );
    appendL10nText(container, doc, getLocaleID("connections-error-state"));
    return;
  }

  const ref = refFor(item);
  const node = mindmapDoc.nodes.find((candidate) =>
    refsMatch(candidate.ref, ref),
  );
  if (!node) {
    appendL10nText(container, doc, getLocaleID("connections-empty-state"));
    appendAddLinkSection(container, doc, item);
    return;
  }

  const titleEl = doc.createElement("div");
  const titleLabel = doc.createElement("span");
  titleLabel.setAttribute(
    "data-l10n-id",
    getLocaleID("connections-mindmap-label"),
  );
  titleEl.appendChild(titleLabel);
  titleEl.appendChild(doc.createTextNode(` ${mindmapDoc.title}`));
  container.appendChild(titleEl);

  appendL10nButton(container, "connections-remove-node-button", () => {
    void handleRemoveNode(container, item, mindmapDoc, node.id);
  });

  // Only offered when the node is actually in a group: this is where a single
  // node leaves one, as opposed to dissolving the whole group from the graph.
  if (node.groupId) {
    appendL10nButton(container, "connections-remove-from-group-button", () => {
      void handleRemoveFromGroup(container, item, mindmapDoc, node.id);
    });
  }

  const links = mindmapDoc.links.filter(
    (link) => link.sourceNodeId === node.id || link.targetNodeId === node.id,
  );
  if (links.length === 0) {
    appendL10nText(container, doc, getLocaleID("connections-no-links-state"));
    appendAddLinkSection(container, doc, item);
    return;
  }

  const list = doc.createElement("ul");
  for (const link of links) {
    const isSource = link.sourceNodeId === node.id;
    const otherNodeId = isSource ? link.targetNodeId : link.sourceNodeId;
    const otherNode = mindmapDoc.nodes.find((n) => n.id === otherNodeId);
    const otherTitle = otherNode
      ? resolveNodeLabel(otherNode.ref)
      : MISSING_ITEM_LABEL;

    const linkType = getLinkTypeById(link.typeId);
    const parts = [linkType?.label ?? link.typeId];
    if (link.name) {
      parts.push(`"${link.name}"`);
    }
    if (link.direction) {
      const forward = link.direction === "forward";
      parts.push(forward === isSource ? "→" : "←");
    }

    const li = doc.createElement("li");
    li.textContent = `${parts.join(" ")} → ${otherTitle}`;

    appendL10nButton(li, "connections-remove-link-button", () => {
      void handleRemoveLink(container, item, mindmapDoc, link.id);
    });

    list.appendChild(li);
  }
  container.appendChild(list);
  appendAddLinkSection(container, doc, item);
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
  await renderConnectionsContent(container, item);
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
