# Logging reference

`src/utils/logging.ts` exports the plugin's two logging entry points. Every catch block that previously called `Zotero.debug` directly calls one of these instead. See [logging-explanation.md](logging-explanation.md) for why the split exists and how it was confirmed.

## `logFailure(message: string, err?: unknown): void`

For a genuine failure - one worth being able to find after the fact, without debug logging having been on when it happened.

Calls `Zotero.logError(new Error(...))`, which reaches both `Zotero.debug` (gated on debug logging) and the Mozilla error console via `Zotero.getErrors()` (not gated on anything).

`message` should already carry the `[zoteroLinkedMindmaps]` prefix and any relevant detail, matching the convention at every call site. `err`, when given, supplies the stack: `err.stack` if `err` is an `Error`, otherwise a stack captured at the `logFailure` call site itself. The stack is appended to `message` with a newline before the combined string becomes the new `Error`'s message - `Zotero.logError` only forwards `err.message` to the error console, not `err.stack`, so a stack left on the `Error` object alone would not survive to that channel.

## `logTrace(message: string, level?: number): void`

For an expected-and-handled condition: something the code already accounts for, not a bug report a user would need to be locatable. A thin wrapper over `Zotero.debug(message, level)` - visible only while debug logging is already enabled.

## Severity by call site

| File                                                     | What's logged                                                                                     | Level                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| `addLinkForm.ts` (both save-link catches)                | link save failed                                                                                  | failure                 |
| `connectionsPanel.ts` (unregister no-op)                 | section was never registered                                                                      | trace                   |
| `connectionsPanel.ts` (add-link form load)               | failed to load mindmap document                                                                   | failure                 |
| `connectionsPanel.ts` (findMindmapForItem)               | unreadable storage note, skipped                                                                  | failure                 |
| `connectionsPanel.ts` (renderPanelBody)                  | failed to read mindmap document                                                                   | failure                 |
| `connectionsPanel.ts` (applyToMindmap)                   | failed to apply a panel change                                                                    | failure                 |
| `containerGuard.ts` (reconcileContainers)                | container reconciliation failed                                                                   | failure                 |
| `containerGuard.ts` (trash notify)                       | container trash check failed                                                                      | failure                 |
| `deletionCleanup.ts` (pruneLibrary, StorageError)        | mindmap vanished/stopped parsing between listing and update - anticipated race, cleanup continues | trace                   |
| `deletionCleanup.ts` (notify)                            | deletion cleanup failed                                                                           | failure                 |
| `graphRenderer.ts` (node drag)                           | persisting dragged node positions failed                                                          | failure                 |
| `graphRenderer.ts` (grouping apply)                      | grouping change failed                                                                            | failure                 |
| `graphRenderer.ts` (live refresh)                        | mindmap live refresh failed                                                                       | failure                 |
| `libraryContextMenu.ts` (mindmapsForPopup)               | could not list mindmaps for the item menu                                                         | failure                 |
| `libraryFilter.ts` (registerLibraryFilter guard)         | no `getSearchObject` to patch, container stays visible                                            | failure                 |
| `libraryFilter.ts` (getSearchObject wrap)                | hiding the plugin container failed                                                                | failure                 |
| `linkTypes.ts` (getLinkTypes, `typeof raw !== "string"`) | pref never set - expected on every fresh profile                                                  | none (silent by design) |
| `linkTypes.ts` (getLinkTypes, JSON.parse)                | link-types pref would not parse, falling back to defaults                                         | failure                 |
| `linkTypes.ts` (getLinkTypes, shape check)               | link-types pref has an unexpected shape, falling back to defaults                                 | failure                 |
| `mindmapTab.ts` (handleSave)                             | mindmap save failed                                                                               | failure                 |
| `mindmapTab.ts` (handleDelete)                           | mindmap delete failed                                                                             | failure                 |
| `storage.ts` (findMindmapById)                           | unreadable storage note, skipped while resolving an id                                            | failure                 |
| `storage.ts` (readAllMindmaps)                           | unreadable storage note, skipped while listing                                                    | failure                 |

The two `deletionCleanup.ts` and `connectionsPanel.ts` (unregister) trace-level sites are the only call sites in the plugin that stayed at trace after this pass: each catches a condition its own comment already documents as expected, not a failure a bug report would need surfaced.

## consolePolyfill routing

`src/utils/consolePolyfill.ts` maps the shimmed `console` object's five logging-adjacent members onto these two functions:

| `console.*` member               | Routes to          |
| -------------------------------- | ------------------ |
| `log`, `group`, `groupCollapsed` | `logTrace`         |
| `warn`                           | `logTrace(..., 2)` |
| `error`                          | `logFailure`       |

`groupEnd` and `trace` remain no-ops. See [polyfills-reference.md](polyfills-reference.md) for the rest of the shim (why it exists, when it must load).

## See also

- [logging-explanation.md](logging-explanation.md) for the probe finding this design is based on.
- `.github/ISSUE_TEMPLATE/bug_report.yml` for the reporter-facing instructions this enables.
