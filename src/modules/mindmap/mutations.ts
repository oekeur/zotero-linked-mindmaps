/**
 * Pure in-memory mutations for user-triggered removal of a single node or
 * link from a mindmap document. removeNode mirrors deletionCleanup.ts's
 * notifier-triggered prune (drop the node, then drop every link touching
 * it) - here triggered from the Connections panel instead of a delete
 * notification, and without touching the underlying Zotero item/note.
 */
import type { MindmapDocument } from "./schema";

export function removeNode(doc: MindmapDocument, nodeId: string): void {
  doc.nodes = doc.nodes.filter((node) => node.id !== nodeId);
  doc.links = doc.links.filter(
    (link) => link.sourceNodeId !== nodeId && link.targetNodeId !== nodeId,
  );
}

export function removeLink(doc: MindmapDocument, linkId: string): void {
  doc.links = doc.links.filter((link) => link.id !== linkId);
}
