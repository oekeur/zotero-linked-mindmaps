# Plan: Fix "Choose target" picker by switching to Zotero's native item-selector dialog

**File:** plans/2026-08-15-fix-target-picker-native-dialog.md
**Goal:** Replace the custom `Zotero.Search` + `ztoolkit.Dialog`/`VirtualizedTableHelper` picker in `src/modules/mindmap/targetPicker.ts` with Zotero's native `chrome://zotero/content/selectItemsDialog.xhtml` so "Choose target" actually renders results.
**Out of scope:** Notes/attachments as selectable targets (TASK-24/TASK-25 territory), multi-select, drilling into child notes.
**Constraints:** `openTargetPicker(): Promise<ZoteroObjectRef | null>` signature must stay unchanged — `addLinkForm.ts` (TASK-14) calls it as-is and shouldn't need edits.

---

## Root cause

`VirtualizedTableHelper`'s constructor does `win.require("react")` etc. — `require` only exists on Zotero's main window, not on the bare `openDialog('about:blank', ...)` popup window `ztoolkit.Dialog` creates. Confirmed live via `npm start`: `TypeError: _require is not a function` at the point `buildTable()` runs, thrown as an uncaught async error inside the dialog's `loadCallback`. `tableHelper` never gets assigned, so `runSearch`'s `tableHelper?.render()` silently no-ops — search queries run fine (visible in the SQL log), nothing ever paints.

## Solution, confirmed against Zotero's actual source

Unpacked `chrome/content/zotero/selectItemsDialog.js` and `collectionViewItemTree.js` from `/opt/zotero-beta/app/omni.ja` (the dialog the native Related panel's `+` button and "change parent item" already use):

- `Zotero.getMainWindow().openDialog('chrome://zotero/content/selectItemsDialog.xhtml', '', 'chrome,dialog=no,modal,centerscreen,resizable=yes', io)` — modal, blocks until closed.
- `io = { dataIn: null, dataOut: null, filterLibraryIDs: [libraryID], singleSelection: true, onlyRegularItems: true }`.
- On accept: `io.dataOut = itemsView.getSelectedItems(true)` — an array of numeric item IDs. `undefined`/empty on cancel.
- `Zotero.getMainWindow()` is the correct window to call `openDialog` on — matches how `ztoolkit`'s own `getGlobal()` resolves arbitrary globals (falls back to `Zotero.getMainWindow()`), consistent with the rest of this codebase's ztoolkit usage.

---

## Phase 1: Swap the picker implementation

**Outcome:** Clicking "Choose target" opens Zotero's native item picker, selecting an item resolves the promise with a valid `ZoteroObjectRef`, cancelling resolves `null` — end to end, verified live.

Tasks:

- [ ] Replace `openTargetPicker()`'s body with the native-dialog call above. Read `io.dataOut?.[0]` as the selected item ID; falsy/empty → resolve `null`. Otherwise `Zotero.Items.get(id)` → `toRef(item)`. — done when: manual round-trip in Zotero (pick item → target label updates → Save persists the link; Cancel → no state change) works with real library data.
      Context:
- [ ] Delete now-dead code in `targetPicker.ts`: `searchTargetItems`, `creatorYearLabel`, the `ztoolkit.Dialog`/`VirtualizedTableHelper` wiring, `RESULT_CAP`/`SEARCH_DEBOUNCE_MS` constants, the now-unused `VirtualizedTableHelper` type import. Update the file's top doc-comment (currently describes the `Zotero.Search`/virtualized-table approach). — done when: `tsc --noEmit` is clean and no dead exports remain.
      Context:
- [ ] `test/mindmap/targetPicker.test.ts` covers the removed `searchTargetItems` export. `openTargetPicker` itself isn't unit-testable (native modal dialog, live Zotero API — same category CLAUDE.md's engineering standards already exclude from unit coverage). Delete this test file rather than rewrite it — a real, intentional loss of coverage, called out in the commit message rather than papered over. — done when: `npm run test:fast` passes with the file removed.
      Context:
- [ ] Self-link guard: keep `addLinkForm.ts`'s existing post-selection `refsMatch(ref, sourceRef)` check unchanged — `selectItemsDialog` has no per-item exclude-by-key option. — done when: attempting to link an item to itself still shows the existing inline validation message.
      Context:
- [ ] Manual verification per CLAUDE.md protocol: `npm run build` + `npm run lint:check`, then `npm start`, exercise Choose target → search → select → Save, plus Cancel. — done when: link is created and visible in the mindmap/Connections panel with the correct target.
      Context:

Unknowns: none outstanding.

---

## Note for TASK-24 (out of scope here, logged as a comment on that task)

`io.onlyRegularItems: false` makes the native dialog show standalone notes _and_ expands parents to reveal child notes/attachments as selectable tree rows (`item.isRegularItem()` is the only filter — no "notes but not attachments" flag exists). If TASK-24 reuses this dialog, it needs a post-selection reject-if-attachment check, same pattern as the self-link guard.

## Open decisions

None — approach is fully specified.
