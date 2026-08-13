# Zotero Linked Mindmaps

A Zotero 7 plugin for organizing and visualizing interconnected sources as one or more mindmaps, with typed, named links between items and notes.

## Why

Zotero's tags and `relatedItem` field connect two items, but not how they're connected. Whether one critiques the other or is the primary source for one specific chapter gets flattened into the same untyped link. For a highly interconnected source corpus, that loses most of the structure worth mapping.

An existing plugin, [samreading/zotero-mindmap](https://github.com/samreading/zotero-mindmap), covers basic note-linking, but has no typed or named links, no way to split sources across more than one mindmap, and no central graph view. This isn't a fork of it and doesn't share its data format.

## What it does

- Typed, named links between items and notes, with an optional direction, so "critiques" and "primary source for chapter 3" mean something more specific than a generic "related."
- Multiple named mindmaps instead of one flat graph, since most people's sources split by topic rather than one global structure.
- A rendered graph per mindmap, with link type shown as a label plus a line-style cue, not color alone (color stops being readable past 8-10 types).
- Link creation from wherever you're actually working: the item pane while reading, a right-click in the library, or directly on an open mindmap.

## Status

Pre-implementation. Scaffolded from [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template); `src/` is still the template's example code, none of it this plugin's functionality yet. See [ROADMAP.md](./ROADMAP.md) for the plan.

## Development

Requires a local Zotero 7 install and a dev profile.

```sh
cp .env.example .env
# set ZOTERO_PLUGIN_ZOTERO_BIN_PATH and ZOTERO_PLUGIN_PROFILE_PATH in .env

npm install
npm start        # builds and hot-reloads into the Zotero dev profile
```

Other commands:

```sh
npm run build        # bundle to a .xpi-ready build, then type-check
npm run lint:check    # Prettier + ESLint, check only
npm run lint:fix      # Prettier + ESLint, auto-fix
npm test              # run test/ against a live Zotero instance
```

## License

AGPL-3.0-or-later.
