# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-implementation: the repo is built on [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) (`addon/`, `src/`, build config), but `src/` still holds only the template's example code — none of it is this plugin's actual functionality yet. Read `project/PRODUCT.md` before making design decisions — it's the product charter (goals, non-goals, and the reasoning behind data-model choices already made).

Plugin name: **Zotero Linked Mindmaps** (`config.addonName`/`addonRef` in `package.json`) — chosen to avoid colliding with `samreading/zotero-mindmap`, an existing, different plugin named in `project/PRODUCT.md:23` that this project improves on.

Two placeholders in `package.json` need real values before a release build/publish (the scaffold build itself works fine without them): `config.addonID` (currently `zoterolinkedmindmaps@example.com`) and `repository.url` (currently a guessed `github.com/oscarkeur/zotero-linked-mindmaps` — wrong owner; the actual git remote is `oekeur/zotero-linked-mindmaps`).

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
- `zotero-plugin-template-examples/` — a gitignored copy of `windingwind/zotero-plugin-template`'s demo code (`src/modules/examples.ts` and its wiring), moved out of `src/` (TASK-4) rather than deleted so the patterns (registering a menu item/shortcut/item-pane section) stay on hand for reference. Not refreshed from upstream; it's a one-time snapshot, not a tracked vendor clone.

## Engineering standards

- **Linting/formatting**: `eslint.config.mjs` (`@zotero-plugin/eslint-config`) + Prettier (config in `package.json`). `@typescript-eslint/no-unused-vars` is currently off repo-wide because of leftover template example code (`src/modules/examples.ts`) — see the `TODO(TASK-3)` comment in `eslint.config.mjs`; re-enable it once that code is replaced. A pre-commit hook (husky + lint-staged) runs Prettier/ESLint on staged files automatically; `npm run lint:check` runs both across the whole repo.
- **Static analysis**: `tsconfig.json` extends `zotero-types/entries/sandbox`, which sets `"strict": true`. `npm run build` runs `tsc --noEmit` as part of the build — that's the type-check gate, not a separate step.
- **Testing**: Mocha via `zotero-plugin test`, run against a live Zotero instance (see `npm test` in Commands). Worth covering: data-model transforms and link CRUD/serialization logic in `src/modules/`. Not practical to unit test here: XUL rendering, Cytoscape layout, live Zotero API interop (per the item-tree row-filtering risk already noted in project memory) — verify those manually via `npm start` instead, following the manual verification protocol below.
- **Manual verification protocol** (for any change touching XUL, Cytoscape, or live Zotero API — nothing here is unit-testable, and most failure modes in this codebase so far have been *silent*, not thrown): before declaring such a change done —
  1. Run `npm run build` and `npm run lint:check` first — cheap, catches type/lint errors before a live-Zotero cycle is even needed.
  2. If a prior session crashed or a manifest edit was mid-flight, run `pkill -9 -f zotero-bin` before `npm start` — a stale process can linger and `npm start` will silently reuse it instead of picking up the fix.
  3. Run `npm test` as the automated startup check before anything manual: `zotero-plugin test`'s `waitForPlugin` config (`() => Zotero.<addonInstance>.data.initialized`, see `zotero-plugin.config.ts`) polls the live instance for 10s and fails the run (nonzero exit) if the plugin's startup hook never sets that flag — see `test/startup.test.ts`. This is a real pass/fail signal, not eyeballing. Note `zotero-plugin-scaffold` discards Zotero's stdout entirely (`ZoteroRunner.startZoteroInstance` no-ops on stdout data) and never passes `-ZoteroDebugText`, so there is no log-to-file mechanism today — `npm test` failing (or the Debug Output panel, Help → Debug Output, for "Error running bootstrap method") is the only signal available, not a tailable file.
  4. Confirm the plugin actually appears under Tools → Plugins — a version-ceiling mismatch (`strict_max_version` in `addon/manifest.json`) blocks loading with no console error and no install failure at all.
  5. If Debug Output shows nothing where an error is expected, that is not proof of success — console output can be filtered or misrouted. Temporarily swap the suspect `Zotero.debug()` calls for `ztoolkit.getGlobal("alert")("Reached: <location>")` and bracket the failing operation to confirm actual execution flow.
  6. If a third-party library throws a bare `ReferenceError` (e.g. `document`, `console`, `Image`, `ResizeObserver`, `MutationObserver` undefined), read the bundled source directly (`node_modules/<pkg>/dist/*.js`) at the failing line rather than guessing — Zotero's bootstrap scope lacks browser globals these libraries assume are always present, and this has been the root cause of every such crash so far.
  7. Before shipping any `package.json`/manifest change, explicitly check the three fields known to fail silently rather than erroring: `repository.url`, `homepage` (package.json — missing/placeholder breaks install with no build-time signal) and `strict_max_version` (manifest.json — blocks loading with no console output).
  8. When testing a custom `Zotero_Tabs` tab type, remember it persists into `<profile>/session.json` across restarts; if the tab type is later renamed or removed, Zotero's session restore can crash on the stale entry before the plugin even loads. Clear it from `session.json` if startup breaks with core `tabs.js`/`itemTree.js` errors unrelated to your change.
- **Commit convention**: `type(scope)!: description #issue` — `type` required (one of `feat`, `fix`, `improve`, `hotfix`, `chore`, `docs`, `test`), `scope` optional but recommended, `!` marks a breaking change, a trailing `#issue` reference is optional and not hook-enforced. Enforced by a `commit-msg` hook (commitlint, config in `commitlint.config.mjs`).
- **Editor config**: `.editorconfig` (2-space indent, LF, UTF-8, trim trailing whitespace, final newline) is the only shared editor config — `.idea/` is gitignored as personal workspace state.
- **CI**: `.github/workflows/ci.yml` runs lint, build, and test jobs on push/PR to `main` (restored from `windingwind/zotero-plugin-template`, which the initial scaffold commit dropped). `release.yml` (tag-triggered, calls `npm run release`) is intentionally not added yet — it needs the `config.addonID`/`repository.url` placeholders fixed first (see Project status above).

## Working conventions

- **Code comments** describe intent and invariants, not provenance. Don't reference a Backlog task ID, milestone name, or acceptance-criterion number in a code comment — that history belongs in commit messages and Backlog, not in code that outlives them.
- **Dependency additions**: don't add a new npm dependency without asking first. Use `AskUserQuestion` and frame it concretely — what the workaround costs (extra code to write/maintain, a narrower feature, a rougher edge case) against what the dependency buys (what becomes simpler or newly possible), plus its footprint (bundle size, maintenance surface, license). Skip the question only when there's no genuine tradeoff to weigh — then just don't add it.
- **`project/` commits**: the `backlog` CLI and manual edits to `project/PRODUCT.md`/`FEATURES.md` write directly into that nested repo's working tree without committing (see Repository layout above). Commit planning/task doc changes there promptly after a planning pass — don't leave `project/` dirty across sessions.
