# Roadmap

Not a task-level breakdown. Phases 0 through 4 and 6 are built; Phase 5 is in progress. Nothing here is released yet.

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

## Phase 5: Library integration polish (in progress)

Filter mindmap storage items out of the default item tree, behind a settings toggle. The `hideMindmapNotes` preference and the item-tree patch are written but not yet committed.

Zotero exposes no API for filtering item-tree rows, so this monkey-patches shared state and carries a real upgrade-breakage risk. See [the library filter notes](./docs/internals/library-filter-explanation.md).

## Phase 6: Node grouping (done)

Select several nodes on a mindmap and group them, separate from a typed or named link. Groups carry an optional name.

## Open

- No released build. Version 0.1.0, install means building from source.
- A trashed plugin-data container hides every mindmap in that library. The plugin does warn, and the warning stays up until clicked, but it says nothing about how to undo the state it reports. A trashed individual storage note is worse: no warning fires at all. See [plugin data recovery](./docs/user-guide/plugin-data-howto.md).
- Sync conflicts on a mindmap document are a knowingly accepted risk, not a solved problem.
