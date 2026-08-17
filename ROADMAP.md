# Roadmap

Not a task-level breakdown. Every phase below is built. Nothing here is released yet.

For what the built features actually do, read the [user guide](./docs/user-guide/); this file records the order things arrived in and what is still open.

## Phase 0: Feasibility spike (done)

Confirmed Cytoscape.js renders inside Zotero's plugin window. It works, but not for free: Zotero's bootstrap scope is missing browser globals Cytoscape assumes exist, and the ones that are present are non-configurable getters that have to be installed with `defineProperty` rather than assignment. See [the Cytoscape notes](./docs/internals/cytoscape-explanation.md).

## Phase 1: V1 MVP (done)

- Data model and storage: one JSON document per mindmap, held in a Zotero note item's content, riding Zotero's own sync. See [storage internals](./docs/internals/storage-explanation.md).
- Link types: a default set, editable in a preferences pane.
- Connections panel: item-pane surface for defining links, plus entry points from the library and from an open mindmap.
- Mindmap tab: renders the graph, link type shown as a label and a line-style cue, not color alone.
- Link-target picker: uses Zotero's native item-selector dialog rather than a custom one.

The original scope said single mindmap and items-only nodes. Both were lifted in later phases.

## Phase 2: Multi-mindmap (done)

Create, rename, describe, and delete multiple named mindmaps, listed in the tab sidebar.

## Phase 3: Notes as nodes (done)

Standalone notes and child notes are linkable nodes, same as regular items. Attachments are not.

## Phase 4: Cross-mindmap links (done)

Links reaching from one mindmap into a node whose membership lives in another, styled to flag it as external. Stale external nodes get pruned.

## Phase 5: Library integration polish (done)

Keep the plugin's storage out of the user's way in the library and in the link-target picker.

The main part is done, and it needs no patched internals. Every storage note is parented to one container item per library, and Zotero's library and collection views add `noChildren` to the search that builds their rows, so a child note never renders as a top-level row. N mindmaps collapse to one visible row through Zotero's own view behavior. This replaced an earlier plan to patch `Zotero.CollectionTreeRow.prototype.getSearchObject` for the same job. See [container guard design](./docs/internals/container-guard-explanation.md).

Hiding that last container row is the one part that does patch `getSearchObject`, behind the `hideMindmapNotes` toggle. It is deliberately optional and fails open: if the method is missing it logs and skips, and if the wrap throws it returns the original search, so a Zotero upgrade costs one visible row rather than an item tree that renders nothing. The honest cost is that it degrades with no signal. See [the library filter notes](./docs/internals/library-filter-explanation.md).

## Phase 6: Node grouping (done)

Select several nodes on a mindmap and group them, separate from a typed or named link. Groups carry an optional name.

## Open

- Version 0.1.0 is published as a `.xpi` on GitHub Releases. It has had no use outside development.
- A trashed plugin-data container hides every mindmap in that library. The plugin does warn, and the warning stays up until clicked, but it says nothing about how to undo the state it reports. A trashed individual storage note is worse: no warning fires at all. See [plugin data recovery](./docs/user-guide/plugin-data-howto.md).
- Sync conflicts on a mindmap document are a knowingly accepted risk, not a solved problem.
