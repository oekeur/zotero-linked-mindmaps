# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-implementation: the repo is built on [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) (`addon/`, `src/`, build config), but `src/` still holds only the template's example code — none of it is this plugin's actual functionality yet. Read `project/PRODUCT.md` before making design decisions — it's the product charter (goals, non-goals, and the reasoning behind data-model choices already made).

Plugin name: **Zotero Linked Mindmaps** (`config.addonName`/`addonRef` in `package.json`) — chosen to avoid colliding with `samreading/zotero-mindmap`, an existing, different plugin named in `project/PRODUCT.md:23` that this project improves on.

Two placeholders in `package.json` need real values before a release build/publish (the scaffold build itself works fine without them): `config.addonID` (currently `zoterolinkedmindmaps@example.com`) and `repository.url` (currently a guessed `github.com/oscarkeur/zotero-linked-mindmaps` — the repo has no git remote configured yet, confirm the actual owner/repo).

## Commands

- `npm start` — builds and hot-reloads the plugin into a running Zotero dev profile (`zotero-plugin serve`). Requires `.env` (copy from `.env.example`) with `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` and `ZOTERO_PLUGIN_PROFILE_PATH` set.
- `npm run build` — bundles `src/`+`addon/` into a `.xpi`-ready build under `.scaffold/build/` via `zotero-plugin build`, then type-checks with `tsc --noEmit`.
- `npm run lint:check` / `npm run lint:fix` — Prettier + ESLint (`@zotero-plugin/eslint-config`).
- `npm test` — runs `test/` via `zotero-plugin test` (Mocha/Chai) against a live Zotero instance.
- `npm run release` — version bump + GitHub release via `zotero-plugin release`.

## Architecture

zoteroMindmap is a **Zotero 7 plugin** (item pane panel + main-window tab, per Zotero's plugin platform), not a standalone app. It gives users typed/named links between Zotero items and notes, organized into multiple named mindmaps, rendered with a graph-layout library rather than a custom layout engine. Full rationale for each design choice (own data model instead of tags/`relatedItem`, multi-mindmap instead of one global graph, items+notes as nodes, separate item-pane "Connections" panel vs. main mindmap view) is in `project/PRODUCT.md` — read it before proposing a different approach, since most obvious alternatives were already considered and ruled out there.

### Repository layout

- `addon/` — static plugin assets copied into the build as-is: `manifest.json`, `bootstrap.js`, `locale/` (Fluent `.ftl` files), `content/` (XHTML/CSS/icons).
- `src/` — TypeScript source, bundled by esbuild (via `zotero-plugin-scaffold`) into `addon/content/scripts/` at build time. `index.ts` is the entry point, `addon.ts` defines the `Addon` singleton, `hooks.ts` wires Zotero lifecycle events, `modules/` and `utils/` hold the rest. Currently all template example code (`modules/examples.ts` etc.) — replace with the item-pane "Connections" panel and mindmap tab per `project/PRODUCT.md`.
- `typings/` — ambient `.d.ts` for globals, locale keys, and prefs (extends `zotero-types`).
- `test/` — Mocha tests run against a live Zotero instance via `zotero-plugin test`.
- `zotero-plugin.config.ts` — scaffold build/serve/test config (source dirs, esbuild options, update URL).
- `.env` (gitignored, copy from `.env.example`) — local Zotero binary/profile paths for `npm start`.
- `project/` — a **separate nested git repository**, not part of this repo's history (gitignored here). It holds product/project management: `PRODUCT.md` (charter) and a Backlog.md task tracker (`project/backlog/`). Don't edit Backlog task/decision/milestone files directly — use the `backlog` CLI so metadata stays consistent (see `project/AGENTS.md` for the enforced workflow).
- `zotero-plugin-docs/` — a gitignored, vendored local clone of the community Zotero plugin dev docs (VitePress site, `docs/` subtree of `windingwind/doc-for-zotero-plugin-dev`). Read files under it directly for Zotero plugin API/lifecycle questions instead of fetching GitHub. Refresh with `cd zotero-plugin-docs && git pull`. The docs' own disclaimer: content may lag behind Zotero itself — cross-check against Zotero's source when something looks off.

  Map of `zotero-plugin-docs/docs/`:
  - `main/` — concepts and guides, roughly in reading order: `what-is-zotero-plugin.md` → `prerequisites.md` → `your-first-zotero-plugin.md` → `plugin-file-structure.md`/`plugin-lifecycle.md`/`shutdown.md` → `zotero-data-model.md` → `privileged-vs-unprivileged.md` → `preferences.md`/`preferences-pane.md` → `zotero-pane.md`/`menu.md`/`reader-ui-injection.md` → `custom-column-item-tree.md`/`custom-row-item-pane-info.md`/`custom-section-item-pane.md` → `item-operations.md`/`collection-operations.md`/`search-operations.md`/`notification-system.md` → `file-io.md`/`http-request.md`/`web-worker.md`/`resource-registry.md` → `plugin-update.md`
  - `api/` — generated API reference (`itemPaneManager`, `itemTreeManager`, `menuManager`, `preferencePanes`, `reader`)
  - `tools/` — plugin scaffolding/build tooling docs
  - Most relevant to this project specifically: `zotero-data-model.md`, `custom-section-item-pane.md`/`itemPaneManager.md` (for the planned Connections item-pane panel), and `zotero-pane.md` (for the mindmap main-window tab).
- `zotero-plugin-toolkit-docs/` — a gitignored, vendored local clone of `windingwind/zotero-plugin-toolkit` (the `docs/` subtree covers the helper library this template's `src/modules/` code is built on — managers for menus, item panes, preference panes, shortcuts, etc.). Read files under it directly instead of fetching GitHub. Refresh with `cd zotero-plugin-toolkit-docs && git pull`.
