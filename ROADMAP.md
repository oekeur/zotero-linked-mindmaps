# Roadmap

Not a task-level breakdown. For what the built features actually do, read the [user guide](./docs/user-guide/); this file records what is planned, what is under consideration, and what is still open.

## Planned

- Find and filter nodes inside an open mindmap: search nodes by label, highlight and move to the match, filter edges by link type. A view-only operation that never writes to the stored document.
- Export a mindmap as an image and as a Zotero note outline: a picture of the rendered graph, and a note listing every node with its links, link types and names. Group regions are drawn as an overlay outside the Cytoscape canvas, so the image export has to composite them or state that they are absent.
- Optional locator on a link: a page, section or passage reference recording where in the source the relation holds, separate from the freeform name. Documents written before the field existed must round-trip untouched.
- Machine-readable export: a format another program can parse, with item metadata resolved instead of bare Zotero keys. The format (plugin JSON, GraphML/GEXF, CSV tables, DOT/Mermaid) and whether import is in scope are still to be decided.

## Considered

- Alternate arrangements and colour-by-attribute: arrange by publication year or colour nodes by item type or tag, as a temporary view. Collides with the rule that node positions are persisted and only overwritten by a drag; ships only if leaving the view restores the stored layout exactly. The colour-by half carries none of that risk and may be worth taking on its own.
- Two-click canvas flow for linking nodes already on the mindmap: right-click a node, choose a source, click the target, and the link form opens with both ends pre-filled. Click-click rather than drag, because drag already repositions and persists. Where the pending indicator lives and whether it survives a tab switch are open.

## Open

- Version 1.0.0 is published as a `.xpi` on GitHub Releases. It has had no use outside development.
- A trashed plugin-data container hides every mindmap in that library. The plugin does warn, and the warning stays up until clicked, but it says nothing about how to undo the state it reports. A trashed individual storage note is worse: no warning fires at all. See [plugin data recovery](./docs/user-guide/plugin-data-howto.md).
- Sync conflicts on a mindmap document are a knowingly accepted risk, not a solved problem.
