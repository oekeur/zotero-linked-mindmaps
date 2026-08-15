/**
 * "Connections" item-pane section: shows which mindmap the current item or
 * note belongs to, lists its existing links, and lets the user remove the
 * node or a single link from the mindmap (without touching the underlying
 * Zotero item/note). Adding links is a separate task. `renderConnectionsContent`
 * is a plain function (not tied to the ItemPaneManager hook shape) so a future
 * docked side-panel mount can call it directly.
 */
import { getLocaleID } from "../../utils/locale";
import {
  findMindmapNote,
  readMindmapDocument,
  writeMindmapDocument,
} from "./storage";
import { getLinkTypeById } from "./linkTypes";
import { removeLink, removeNode } from "./mutations";
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
 * Renders the Connections panel content for `item` into `container`.
 * Shows the mindmap the item belongs to (if any) and its links, with
 * controls to remove the node or a single link from the mindmap.
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

  const removeNodeButton = doc.createElement("button");
  removeNodeButton.setAttribute(
    "data-l10n-id",
    getLocaleID("connections-remove-node-button"),
  );
  removeNodeButton.addEventListener("click", () => {
    void handleRemoveNode(container, item, mindmapDoc, node.id);
  });
  container.appendChild(removeNodeButton);

  const links = mindmapDoc.links.filter(
    (link) => link.sourceNodeId === node.id || link.targetNodeId === node.id,
  );
  if (links.length === 0) {
    appendL10nText(container, doc, getLocaleID("connections-no-links-state"));
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

    const removeLinkButton = doc.createElement("button");
    removeLinkButton.setAttribute(
      "data-l10n-id",
      getLocaleID("connections-remove-link-button"),
    );
    removeLinkButton.addEventListener("click", () => {
      void handleRemoveLink(container, item, mindmapDoc, link.id);
    });
    li.appendChild(removeLinkButton);

    list.appendChild(li);
  }
  container.appendChild(list);
}

async function handleRemoveNode(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapDoc: MindmapDocument,
  nodeId: string,
): Promise<void> {
  removeNode(mindmapDoc, nodeId);
  try {
    await writeMindmapDocument(mindmapDoc, item.libraryID);
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] Connections panel failed to remove node: ${
        (err as Error).message
      }`,
    );
  }
  await renderConnectionsContent(container, item);
}

async function handleRemoveLink(
  container: HTMLElement,
  item: Zotero.Item,
  mindmapDoc: MindmapDocument,
  linkId: string,
): Promise<void> {
  removeLink(mindmapDoc, linkId);
  try {
    await writeMindmapDocument(mindmapDoc, item.libraryID);
  } catch (err) {
    Zotero.debug(
      `[zoteroLinkedMindmaps] Connections panel failed to remove link: ${
        (err as Error).message
      }`,
    );
  }
  await renderConnectionsContent(container, item);
}
