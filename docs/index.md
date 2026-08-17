---
layout: home

hero:
  name: Zotero Linked Mindmaps
  text: Map how your sources connect
  tagline: Typed, named links between Zotero items and notes, organized into named mindmaps and rendered as a graph.
  actions:
    - theme: brand
      text: Get started
      link: /user-guide/getting-started
    - theme: alt
      text: Lost your mindmaps?
      link: /user-guide/plugin-data-howto
    - theme: alt
      text: View on GitHub
      link: https://github.com/oekeur/zotero-linked-mindmaps

features:
  - title: Links that say something
    details: '"Critiques" and "primary source for chapter 3", instead of a generic related. Link types are a vocabulary you edit, with an optional direction.'
    link: /user-guide/link-types-howto
  - title: More than one map
    details: Your sources split by topic instead of crammed into one global structure. Mindmaps are named and separate, and links can still reach across them.
    link: /user-guide/mindmaps-manage-howto
  - title: Built where you work
    details: Add links from the item pane while you read, from a right-click in the library, or from a node on an open mindmap.
    link: /user-guide/links-add-howto
  - title: Rides Zotero's own sync
    details: Each mindmap is a JSON document in a Zotero note under one container item per library, so your mindmaps follow the library across machines with no extra account.
    link: /user-guide/plugin-data-explanation
---

## Where to start

The documentation here follows [Diataxis](https://diataxis.fr/). Tutorials teach, how-tos solve one task, reference states what exists, and explanation says why the design is what it is.

| You want to                    | Read                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Build a first mindmap          | [Getting started](./user-guide/getting-started.md)                                                                        |
| Recover mindmaps that vanished | [Plugin data recovery](./user-guide/plugin-data-howto.md)                                                                 |
| Add a link type of your own    | [Editing link types](./user-guide/link-types-howto.md)                                                                    |
| Run the project locally        | [Development setup](./contributing/development-setup.md)                                                                  |
| Publish a version              | [Cutting a release](./contributing/releasing-howto.md)                                                                    |
| Change how mindmaps are stored | [Storage design](./internals/storage-explanation.md), then [storage reference](./internals/storage-reference.md)          |
| Add a Zotero notifier observer | [Notifiers and the storage queue](./internals/notifier-queue-explanation.md) first, it constrains what an observer may do |
| Change the graph's look        | [Rendering design](./internals/rendering-explanation.md)                                                                  |

## The three sections

The [user guide](./user-guide/getting-started.md) covers the mindmap tab, the Connections panel, link types, grouping, cross-mindmap links, and what to do when the plugin's data ends up in the trash.

[Contributing](./contributing/development-setup.md) covers dev setup, the npm scripts, testing against a live Zotero instance, and the configuration fields that fail silently when they're wrong.

[Internals](./internals/storage-explanation.md) documents the storage layer, the document schema, graph rendering, and the plugin lifecycle, along with the Zotero constraints that shaped each one.

## Status

Implemented and usable, but not released yet. Installing means building from source, which [development setup](./contributing/development-setup.md) walks through.

One thing worth knowing before you start. The plugin stores its data in a library item called "Zotero Linked Mindmaps (plugin data)". Trash that item and every mindmap in the library disappears until you restore it. Nothing is lost, but it is alarming the first time. [How to recover](./user-guide/plugin-data-howto.md).
