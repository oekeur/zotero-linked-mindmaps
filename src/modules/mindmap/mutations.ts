/**
 * In-memory operations on a mindmap document: building nodes from Zotero
 * items, and user-triggered removal of a single node or link. removeNode
 * mirrors deletionCleanup.ts's notifier-triggered prune (drop the node, then
 * drop every link touching it) - here triggered from the Connections panel
 * instead of a delete notification, and without touching the underlying
 * Zotero item/note.
 */
import {
  UNPLACED_POSITION,
  type MindmapDocument,
  type MindmapNode,
  type ZoteroObjectRef,
} from "./schema";

/** The Zotero object types a mindmap node is allowed to point at. */
export function canBeMindmapNode(item: Zotero.Item): boolean {
  return item.isRegularItem() || item.isNote();
}

export function refFor(item: Zotero.Item): ZoteroObjectRef {
  return {
    kind: item.isNote() ? "note" : "item",
    libraryID: item.libraryID,
    key: item.key,
  };
}

/**
 * Builds a member node for `ref` with no position yet. Uses the canonical
 * UNPLACED_POSITION rather than a real coordinate: layoutUnplacedNodes only
 * picks up nodes isUnplaced() reports as unplaced, so a node born at {0, 0}
 * is never laid out and sits at the origin under every other such node.
 */
export function createMemberNode(ref: ZoteroObjectRef): MindmapNode {
  return {
    membership: "member",
    id: Zotero.Utilities.generateObjectKey(),
    position: UNPLACED_POSITION,
    ref,
  };
}

/**
 * Builds a stub standing in, on this mindmap, for a node that belongs to
 * another one. The pair (homeMindmapId, homeNodeId) is the whole record: the
 * ref is carried alongside so the node can be drawn without opening the other
 * document, but the other document stays the source of truth, and the stub is
 * dropped when what it points at goes away.
 */
export function createExternalNode(
  ref: ZoteroObjectRef,
  homeMindmapId: string,
  homeNodeId: string,
): MindmapNode {
  return {
    membership: "external",
    id: Zotero.Utilities.generateObjectKey(),
    position: UNPLACED_POSITION,
    ref,
    homeMindmapId,
    homeNodeId,
  };
}

export function removeNode(doc: MindmapDocument, nodeId: string): void {
  doc.nodes = doc.nodes.filter((node) => node.id !== nodeId);
  doc.links = doc.links.filter(
    (link) => link.sourceNodeId !== nodeId && link.targetNodeId !== nodeId,
  );
}

export function removeLink(doc: MindmapDocument, linkId: string): void {
  doc.links = doc.links.filter((link) => link.id !== linkId);
}
