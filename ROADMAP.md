# Roadmap

Not a task-level breakdown. Order past Phase 1 isn't fixed.

## Phase 0: Feasibility spike

Confirm a JS graph library renders inside Zotero's plugin window. Cytoscape.js is the leading candidate.

## Phase 1: V1 MVP

Single mindmap, items-only nodes, no cross-mindmap links.

- Data model & storage: one JSON document per mindmap, held in a Zotero note item's content, riding Zotero's own sync.
- Link types: a default set, customizable via a settings panel.
- Connections panel: item-pane surface for defining links, plus entry points from the library and from an open mindmap.
- Mindmap tab: renders the graph, link type shown as a label and a line-style cue, not color alone.
- Link-target picker: search-filtered dialog for choosing what to link to.

## Phase 2: Multi-mindmap

Create, rename, describe, and delete multiple named mindmaps.

## Phase 3: Notes as nodes

Standalone notes and child notes become linkable nodes, same as items.

## Phase 4: Cross-mindmap links

Links that reach from one mindmap into a node whose membership lives in another, styled distinctly to flag it as external.

## Phase 5: Library integration polish

Filter mindmap-storage notes out of the default item tree, behind a settings toggle.
