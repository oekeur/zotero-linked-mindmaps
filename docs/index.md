# Documentation

Zotero Linked Mindmaps, organized along [Diataxis](https://diataxis.fr/): tutorials teach, how-tos solve a task, reference states what exists, explanation says why.

New here? Start with [Getting started](./user-guide/getting-started.md).

Lost your mindmaps? Go straight to [plugin data recovery](./user-guide/plugin-data-howto.md).

## User guide

**Mindmaps and the graph tab**
[Getting started](./user-guide/getting-started.md) ·
[Mindmap tab reference](./user-guide/mindmap-tab-reference.md) ·
[Using the tab](./user-guide/mindmap-tab-howto.md) ·
[Managing mindmaps](./user-guide/mindmaps-manage-howto.md) ·
[Node overview dock](./user-guide/node-overview-reference.md)

**Layout and grouping**
[Node layout reference](./user-guide/node-layout-reference.md) ·
[Why positions persist](./user-guide/node-layout-explanation.md) ·
[Grouping reference](./user-guide/grouping-reference.md) ·
[Grouping nodes](./user-guide/grouping-howto.md)

**Links**
[Add-link reference](./user-guide/links-add-reference.md) ·
[Adding a link](./user-guide/links-add-howto.md) ·
[Connections panel reference](./user-guide/connections-panel-reference.md) ·
[Using the Connections panel](./user-guide/connections-panel-howto.md) ·
[Library right-click reference](./user-guide/library-menu-reference.md) ·
[Adding items from the library](./user-guide/library-menu-howto.md)

**Link types**
[Reference](./user-guide/link-types-reference.md) ·
[Editing link types](./user-guide/link-types-howto.md) ·
[Why types are editable](./user-guide/link-types-explanation.md)

**Cross-mindmap links**
[Reference](./user-guide/cross-mindmap-links-reference.md) ·
[Linking across mindmaps](./user-guide/cross-mindmap-links-howto.md) ·
[Why external nodes exist](./user-guide/cross-mindmap-links-explanation.md)

**Plugin data in your library**
[What the plugin stores](./user-guide/plugin-data-reference.md) ·
[Recovering trashed plugin data](./user-guide/plugin-data-howto.md) ·
[Why data lives in a note](./user-guide/plugin-data-explanation.md) ·
[Hiding plugin data reference](./user-guide/hide-plugin-data-reference.md) ·
[Hiding plugin data](./user-guide/hide-plugin-data-howto.md)

## Contributing

[Development setup](./contributing/development-setup.md) ·
[npm scripts](./contributing/npm-scripts-reference.md) ·
[Running tests](./contributing/testing-howto.md) ·
[Why tests run against live Zotero](./contributing/testing-explanation.md) ·
[Configuration](./contributing/configuration-reference.md)

## Internals

**Storage and data model**
[Storage reference](./internals/storage-reference.md) ·
[Storage design](./internals/storage-explanation.md) ·
[Schema reference](./internals/schema-reference.md) ·
[Schema design](./internals/schema-explanation.md) ·
[Validation reference](./internals/validate-reference.md) ·
[Why stored JSON is untrusted](./internals/validate-explanation.md) ·
[Mutations reference](./internals/mutations-reference.md)

**Cleanup and reconciliation**
[Container guard reference](./internals/container-guard-reference.md) ·
[Container guard design](./internals/container-guard-explanation.md) ·
[Deletion cleanup reference](./internals/deletion-cleanup-reference.md) ·
[Deletion cleanup design](./internals/deletion-cleanup-explanation.md) ·
[Cross-mindmap cleanup reference](./internals/cross-mindmap-cleanup-reference.md) ·
[Cross-mindmap cleanup design](./internals/cross-mindmap-cleanup-explanation.md)

**Rendering**
[Rendering reference](./internals/rendering-reference.md) ·
[Rendering design](./internals/rendering-explanation.md) ·
[Layout reference](./internals/layout-reference.md) ·
[Node labels reference](./internals/node-labels-reference.md) ·
[UI element helpers](./internals/ui-elements-reference.md) ·
[Cytoscape inside Zotero](./internals/cytoscape-explanation.md)

**Lifecycle and Zotero integration**
[Lifecycle reference](./internals/lifecycle-reference.md) ·
[Lifecycle design](./internals/lifecycle-explanation.md) ·
[Library filter reference](./internals/library-filter-reference.md) ·
[Library filter design](./internals/library-filter-explanation.md) ·
[Polyfills reference](./internals/polyfills-reference.md) ·
[Locale reference](./internals/locale-reference.md) ·
[Preferences reference](./internals/prefs-reference.md) ·
[Notifiers and the storage queue](./internals/notifier-queue-explanation.md)

## Start here for a given problem

| You want to                    | Read                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Build a first mindmap          | [Getting started](./user-guide/getting-started.md)                                                                        |
| Recover mindmaps that vanished | [Plugin data recovery](./user-guide/plugin-data-howto.md)                                                                 |
| Add a link type of your own    | [Editing link types](./user-guide/link-types-howto.md)                                                                    |
| Run the project locally        | [Development setup](./contributing/development-setup.md)                                                                  |
| Change how mindmaps are stored | [Storage design](./internals/storage-explanation.md), then [storage reference](./internals/storage-reference.md)          |
| Add a Zotero notifier observer | [Notifiers and the storage queue](./internals/notifier-queue-explanation.md) first, it constrains what an observer may do |
| Change the graph's look        | [Rendering design](./internals/rendering-explanation.md)                                                                  |

The backfill queue that produced these docs is [here](./backfill-queue.md).
