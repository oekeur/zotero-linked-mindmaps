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
  type MindmapGroup,
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

/**
 * Puts `nodeIds` in a new group and returns it. Membership is exclusive: a
 * node already in another group moves, it doesn't end up in both. That falls
 * out of the rendering (a Cytoscape node has one parent) rather than being a
 * product judgement, and is the one thing here that would need rethinking if
 * overlapping groups are ever wanted.
 *
 * Positions are not touched. A group is drawn around wherever its members
 * already sit; it never moves them.
 */
export function createGroup(
  doc: MindmapDocument,
  nodeIds: string[],
  name?: string,
): MindmapGroup {
  const group: MindmapGroup = {
    id: Zotero.Utilities.generateObjectKey(),
    ...(name ? { name } : {}),
  };
  const members = new Set(nodeIds);
  doc.groups = [...(doc.groups ?? []), group];
  doc.nodes = doc.nodes.map((node) =>
    members.has(node.id) ? { ...node, groupId: group.id } : node,
  );
  return group;
}

export function renameGroup(
  doc: MindmapDocument,
  groupId: string,
  name: string,
): void {
  doc.groups = (doc.groups ?? []).map((group) =>
    group.id === groupId ? { ...group, ...(name ? { name } : {}) } : group,
  );
}

/**
 * Removes the group itself. Its members stay exactly where they are, keeping
 * their links; only the fact that they were clustered goes away.
 */
export function deleteGroup(doc: MindmapDocument, groupId: string): void {
  doc.groups = (doc.groups ?? []).filter((group) => group.id !== groupId);
  doc.nodes = doc.nodes.map((node) =>
    node.groupId === groupId ? withoutGroup(node) : node,
  );
}

export function removeFromGroup(doc: MindmapDocument, nodeId: string): void {
  doc.nodes = doc.nodes.map((node) =>
    node.id === nodeId ? withoutGroup(node) : node,
  );
}

// Deletes the key rather than setting it undefined, so a node that was never
// grouped and one that has been ungrouped serialize identically.
function withoutGroup(node: MindmapNode): MindmapNode {
  const { groupId: _dropped, ...rest } = node;
  return rest as MindmapNode;
}
