# Why grouping is stored on the node

A group is a visual cluster of nodes on one mindmap. For what it does and how it renders see [grouping-reference.md](../user-guide/grouping-reference.md); for the types see [schema-reference.md](schema-reference.md). This page covers the three storage decisions those pages state without justifying: membership recorded on the node, two membership keys instead of one, and a schema version that did not move when the second key arrived.

## Membership lives on the node

`MindmapGroup` is `{id, name?}`. It holds no member list. A group's members are whichever nodes name its id, and `groupOverlay.readGroups` finds them by scanning every node in the document once per group.

The alternative, a `nodeIds` array on the group, is the obvious shape and the more expensive one. It is a second structure recording the same fact, and every mutation that touches nodes then has to keep it in step. `withoutNodes` is the case that decides it: deleting a node filters `doc.nodes` and `doc.links` and touches nothing group-shaped, because there is nothing group-shaped to touch. With a member list, that function and every path into it, including [deletion cleanup](deletion-cleanup-explanation.md) reconciling against current library state, would each need a prune, and a missed one leaves a group holding an id no node answers to. This is the same reasoning that keeps the note registry out of an index note: see [storage-explanation.md](storage-explanation.md).

The renderer wanted it this way too, for a reason that no longer applies. The group visual that shipped first was a Cytoscape compound node, and Cytoscape records containment on the child (`NodeDataDefinition.parent`), so the node was the only place membership could go. The overlay region that replaced it computes its geometry from a set of member positions and would have accepted either shape. Membership stayed on the node on its own merits.

Two costs come with it, both accepted.

Finding a group's members is a scan over every node, repeated per group. At the sizes a mindmap reaches by hand that is not worth indexing around.

Nothing collects a group whose members all left. `deleteGroup` removes the record, but `removeFromGroup` called on the last member does not: there is no reverse index that would notice it was the last. The record stays in the stored document, `readGroups` filters it out of the drawing, and the colour assignment counts it deliberately so that an emptied group does not shift every later group's hue.

## Two keys for one fact

A grouped node carries both `groupIds` and `groupId`. `groupIds` is the answer; `groupId` holds `groupIds[0]`. `withGroupIds` writes both on every membership change and `groupIdsOf` is the only supported read.

`groupId` shipped first, when a node could be in one group. Keeping it current costs one line and buys something specific: an install predating overlapping membership reads `groupId`, so it draws one of the node's groups rather than none of them. Dropping the key would have made every grouped node look ungrouped over there.

Reading through `groupIdsOf` rather than off either key is what covers the other direction. A document written before `groupIds` existed carries only `groupId`, and `groupIds` alone would report it as ungrouped. `groupIdsOf` falls back, so those documents open correctly with no migration pass and no write on open.

Both keys are deleted rather than set to `undefined` when the last membership goes, so a node that was never grouped and a node that has been ungrouped serialize identically.

The risk the arrangement accepts is divergence, not loss. An older install's `createGroup` writes `groupId` and leaves `groupIds` stale, and nothing detects that on the way back. A node would then render in the group the old install put it in and lose the memberships it had here.

## Why `schemaVersion` stayed at 1

`parseMindmapDocument` checks `schemaVersion` before anything else and rejects any value other than `1` outright. That rejection is deliberate and is what makes an unreadable document better than a silently truncated one; [schema-explanation.md](schema-explanation.md) covers why.

It also sets the price of a version bump. A mindmap is JSON inside a synced Zotero note, so a document written by a newer plugin lands on machines running older ones. Moving to `schemaVersion: 2` would make every document written here rejected on every install that had not updated, and the mindmap would drop out of that machine's list until it did.

Adding `groupIds` alongside `groupId` avoids paying that. `parseMindmapDocument` assigns `nodes: data.nodes` verbatim, and `isMindmapNode` checks the keys it knows and ignores the rest, so a node key an older validator has never heard of survives a read and a write there unchanged. An older install round-trips `groupIds` without dropping it, which is exactly what a version bump would have been protecting against and the reason one was not needed.

The tracker records the full comparison, including the four region shapes measured and the rendering costs, as `decision-3`.
