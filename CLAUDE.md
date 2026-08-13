# zoteroMindmap

Zotero 7 plugin. See `project/PRODUCT.md` for the product charter and scope decisions.

## Zotero plugin dev docs (local reference)

`zotero-plugin-docs/docs/` is a local clone of the community VitePress docs
(https://github.com/windingwind/doc-for-zotero-plugin-dev, `docs/` subtree only,
shallow/sparse checkout). It's gitignored — vendored reference material, not
project source. Read files under it directly instead of fetching the GitHub
pages over the network.

To refresh: `cd zotero-plugin-docs && git pull`.

Docs authors note the content may lag behind Zotero itself — cross-check
against Zotero's own source when something looks off.

### Map

- `docs/main/` — concepts and guides, read roughly in this order:
  - `what-is-zotero-plugin.md`, `prerequisites.md`, `your-first-zotero-plugin.md` — start here
  - `plugin-file-structure.md`, `plugin-lifecycle.md`, `shutdown.md` — plugin anatomy and lifecycle
  - `zotero-data-model.md` — items, notes, collections; relevant to this project's link/mindmap data model
  - `privileged-vs-unprivileged.md` — sandboxing model for plugin code
  - `preferences.md`, `preferences-pane.md` — settings storage and UI
  - `zotero-pane.md`, `menu.md`, `reader-ui-injection.md` — injecting UI into the main window/reader
  - `custom-column-item-tree.md`, `custom-row-item-pane-info.md`, `custom-section-item-pane.md` — item pane/tree customization (relevant to the planned "Connections" item-pane panel)
  - `item-operations.md`, `collection-operations.md`, `search-operations.md`, `notification-system.md` — data layer + change events
  - `file-io.md`, `http-request.md`, `web-worker.md`, `resource-registry.md` — platform APIs
  - `plugin-update.md` — release/update mechanics
- `docs/api/` — generated API reference (`itemPaneManager`, `itemTreeManager`, `menuManager`, `preferencePanes`, `reader`)
- `docs/tools/` — plugin scaffolding/build tooling docs

Most relevant to this project specifically: `zotero-data-model.md`,
`custom-section-item-pane.md`/`itemPaneManager.md` (for the Connections panel),
and `zotero-pane.md` (for the mindmap tab in the main window).
