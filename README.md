# Zotero Linked Mindmaps

A Zotero 7 plugin for organizing and visualizing interconnected sources as one or more mindmaps, with typed, named links between items and notes.

## Why

Zotero's tags and `relatedItem` field connect two items, but not how they're connected. Whether one critiques the other or is the primary source for one specific chapter gets flattened into the same untyped link. For a highly interconnected source corpus, that loses most of the structure worth mapping.

An existing plugin, [samreading/zotero-mindmap](https://github.com/samreading/zotero-mindmap), covers basic note-linking, but has no typed or named links, no way to split sources across more than one mindmap, and no central graph view. This isn't a fork of it and doesn't share its data format.

## What it does

- Typed, named links between items and notes, with an optional direction, so "critiques" and "primary source for chapter 3" mean something more specific than a generic "related." Link types are a vocabulary you edit, not a fixed list.
- Multiple named mindmaps instead of one flat graph, since most people's sources split by topic rather than one global structure.
- A rendered graph per mindmap in its own Zotero tab, with link type shown as a label plus a line-style cue, not color alone (color stops being readable past 8-10 types). Parallel links between the same two nodes are offset so each stays readable and separately labeled.
- Link creation from wherever you're actually working: a "Connections" section in the item pane while reading, a right-click in the library, or a right-click on a node in an open mindmap.
- Node positions you set by dragging, persisted with the mindmap. Nodes you haven't placed get laid out on a grid.
- Node grouping, for marking a cluster as belonging together without inventing a link between every pair.
- Cross-mindmap links, reaching from one mindmap into a node whose membership lives in another, styled to flag it as external.

Mindmap data lives in a Zotero note item, tagged and parented to a per-library container item, so it syncs with your library through Zotero itself rather than a separate account or file. The container can be hidden from the library view.

## Install

Download `zotero-linked-mindmaps.xpi` from the [latest release](https://github.com/oekeur/zotero-linked-mindmaps/releases/latest). If your browser opens it instead of saving it, use "Save link as".

In Zotero: open Tools, then Plugins. Click the gear icon at the top right, choose "Install Plugin From File...", pick the `.xpi`, and restart Zotero. Requires Zotero 7.

The build carries an update URL, so Zotero's own plugin updater offers later versions. A plugin that fails to load does so quietly, with no error dialog, so check that "Zotero Linked Mindmaps" appears in the Plugins list after the restart.

[Getting started](./docs/user-guide/getting-started.md) walks from there to a first linked mindmap.

## Status

Version 0.1.0, the first published build. The feature set above works. Expect rough edges, and read [the plugin data guide](./docs/user-guide/plugin-data-howto.md) before you go poking at the "Zotero Linked Mindmaps (plugin data)" item in your library. Trashing it hides every mindmap in that library until you restore it.

See [ROADMAP.md](./ROADMAP.md) for what came in which phase and what's still open.

## Documentation

Published at **https://oekeur.github.io/zotero-linked-mindmaps/** (built from [`docs/`](./docs/) by VitePress on every push to `main`). The same pages render in-repo if you'd rather browse the source tree.

Working on the docs locally:

```sh
npm run docs:dev      # local server with hot reload
npm run docs:build    # production build, fails on any dead link
npm run docs:preview  # serve the built site
```

- [Getting started](./docs/user-guide/getting-started.md) walks from an empty install to a first linked mindmap.
- [User guide](./docs/user-guide/) covers the mindmap tab, the Connections panel, link types, grouping, cross-mindmap links, and recovering plugin data from the trash.
- [Contributing](./docs/contributing/) covers dev setup, the npm scripts, testing against a live Zotero instance, and configuration.
- [Internals](./docs/internals/) documents the storage layer, the document schema, graph rendering, and the plugin lifecycle, including the Zotero integration constraints that shaped them.

## Development

Requires a local Zotero 7 install and a dev profile. [Full setup guide](./docs/contributing/development-setup.md). [CONTRIBUTING.md](./CONTRIBUTING.md) covers filing an issue, the verification gate, and the commit convention.

```sh
cp .env.example .env
# set ZOTERO_PLUGIN_ZOTERO_BIN_PATH and ZOTERO_PLUGIN_PROFILE_PATH in .env

npm install
npm start        # builds and hot-reloads into the Zotero dev profile
```

Other commands:

```sh
npm run build         # bundle to a .xpi-ready build, then type-check with tsc --noEmit
npm run lint:check    # Prettier + ESLint, check only
npm run lint:fix      # Prettier + ESLint, auto-fix
npm test              # run test/ against a live Zotero instance
npm run test:fast     # same run, but kills Zotero on the completion line instead of
                      # waiting for its GUI to exit, which sometimes never happens
npm run clean:profile # reset the dev profile (also runs automatically before npm start)
```

`npm run build` type-checks `src/` but not `test/`, so run the suite after changing an exported signature.

## License

AGPL-3.0-or-later.
