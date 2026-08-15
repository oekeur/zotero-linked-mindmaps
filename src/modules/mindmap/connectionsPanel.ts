/**
 * "Connections" item-pane section: shows which mindmap the current item or
 * note belongs to, lists its existing links, and offers an "Add link" action
 * (see addLinkForm.ts) to create a new one. `renderConnectionsContent` is a
 * plain function (not tied to the ItemPaneManager hook shape) so a future
 * docked side-panel mount can call it directly.
 */
import { getLocaleID } from "../../utils/locale";
import { findMindmapNote, readMindmapDocument } from "./storage";
import { getLinkTypeById } from "./linkTypes";
import { renderAddLinkForm } from "./addLinkForm";
import type { MindmapDocument, MindmapNode, ZoteroObjectRef } from "./schema";

const PANE_ID = "zotero-linked-mindmaps-connections";

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
      onItemChange: ({ item, setEnabled }) => {
        setEnabled(item.isRegularItem() || item.isNote());
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

function refsMatch(a: ZoteroObjectRef, b: ZoteroObjectRef): boolean {
  return a.kind === b.kind && a.libraryID === b.libraryID && a.key === b.key;
}

const MISSING_ITEM_LABEL = "(missing item)";

function resolveNodeTitle(node: MindmapNode): string {
  const target = Zotero.Items.getByLibraryAndKey(
    node.ref.libraryID,
    node.ref.key,
  );
  return target ? target.getDisplayTitle() : MISSING_ITEM_LABEL;
}

function appendL10nText(container: HTMLElement, doc: Document, id: string) {
  const el = doc.createElement("div");
  el.setAttribute("data-l10n-id", id);
  container.appendChild(el);
}

/**
 * Appends the "Add link" toggle button and its (initially hidden, lazily
 * loaded) form container to `container`. The mindmap document is only read
 * once the user actually clicks the button, so simply viewing the panel
 * never creates a mindmap note as a side effect.
 */
function appendAddLinkSection(
  container: HTMLElement,
  doc: Document,
  item: Zotero.Item,
) {
  const wrapper = doc.createElement("div");

  const toggleButton = doc.createElement("button");
  toggleButton.setAttribute("data-l10n-id", getLocaleID("add-link-button"));

  const formContainer = doc.createElement("div");
  formContainer.style.display = "none";

  toggleButton.addEventListener("click", () => {
    const isHidden = formContainer.style.display === "none";
    formContainer.style.display = isHidden ? "" : "none";
    if (isHidden && formContainer.childElementCount === 0) {
      void loadAddLinkForm(formContainer, item, container);
    }
  });

  wrapper.appendChild(toggleButton);
  wrapper.appendChild(formContainer);
  container.appendChild(wrapper);
}

async function loadAddLinkForm(
  formContainer: HTMLElement,
  item: Zotero.Item,
  panelContainer: HTMLElement,
) {
  try {
    const mindmapDoc = await readMindmapDocument(item.libraryID);
    renderAddLinkForm(formContainer, item, mindmapDoc, () => {
      void renderConnectionsContent(panelContainer, item);
    });
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

/**
 * Renders the Connections panel content for `item` into `container`: the
 * mindmap the item belongs to (if any), its existing links, and an
 * "Add link" action.
 */
export async function renderConnectionsContent(
  container: HTMLElement,
  item: Zotero.Item,
): Promise<void> {
  const doc = container.ownerDocument!;
  container.textContent = "";

  if (!item.isRegularItem() && !item.isNote()) {
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
    mindmapDoc = await readMindmapDocument(item.libraryID);
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] Connections panel failed to read mindmap document: ${
        (err as Error).message
      }`,
    );
    appendL10nText(container, doc, getLocaleID("connections-error-state"));
    return;
  }

  const ref: ZoteroObjectRef = {
    kind: item.isNote() ? "note" : "item",
    libraryID: item.libraryID,
    key: item.key,
  };
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
      ? resolveNodeTitle(otherNode)
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
    list.appendChild(li);
  }
  container.appendChild(list);
  appendAddLinkSection(container, doc, item);
}
