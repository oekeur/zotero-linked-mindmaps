# Plan: Container item for mindmap storage notes

**File:** plans/2026-08-16-container-item-for-storage-notes.md
**Goal:** Stop mindmap storage notes cluttering the library by reparenting them under one plugin-owned container item per library, instead of filtering the item tree via unsupported internals.
**Out of scope:** Any change to the mindmap JSON schema, the note HTML format, or how documents are read/written; moving storage off note items. The `getSearchObject` patch is out of scope for TASK-31 and lives in TASK-32 alone, where it hides a single row and is allowed to fail open.
**Constraints:** Storage keeps riding Zotero's item sync (PRODUCT.md concept 1). No new npm dependencies. The container must be discoverable by every synced device, so its identity cannot live in a pref.

**Why this shape:** `collectionTreeRow.js:452,457` (Zotero 10.0-beta.25) adds `noChildren` to the search behind library and collection views, so child notes never render as top-level rows. That is Zotero's own view behavior, not an internal being patched. It covers the native `selectItemsDialog` the target picker opens (`targetPicker.ts:46`) too, where storage notes are currently offered as selectable link targets.

**Rejected alternative:** `Zotero.SyncedSettings` would give a per-library JSON store with no item-tree presence at all, but `dataserver/model/Settings.inc.php` whitelists setting names (six literals plus `lastPageIndex_`/`lastRead_` patterns) and caps values at 30,000 characters. A plugin key is rejected at upload, so the data would never leave the local sqlite, which breaks the sync constraint above.

---

## Phase 1: Container item, new notes parented

**Outcome:** On a fresh library, creating mindmaps produces exactly one visible row ("Zotero Linked Mindmaps (plugin data)") no matter how many mindmaps exist. Storage notes are its children.

Tasks:

- [x] Add `CONTAINER_TAG` and `findOrCreateContainer(libraryID)` to `storage.ts` — creates a `document` item with a fixed English title, tagged, saved via `saveTx()`; lookup is by tag so every synced device finds the same one, and the title stays untranslated because it is stored data, not UI — done when: two consecutive calls in the same library return the same item id, and the item is found by tag after a reload
      Context:
- [x] Parent new storage notes: `createNoteFor` sets `parentItemID` from the container before save — done when: a newly created mindmap note has a non-null `parentItemID` pointing at the tagged container, and `findAllMindmapNotes` still returns it (the registry search adds no `noChildren` condition, so child notes still match)
      Context:
- [x] Confirm the row-level effect in a live profile — done when: with three mindmaps present, My Library shows one plugin row rather than three, and the target picker's top level shows none of the storage notes
      Context:

Unknowns:

- Reparenting fires a `modify` notification whose note content is unchanged; `graphRenderer`'s live-refresh suppresses echoes by content identity, so this should be inert, but it is unverified.
- The container also appears under "Unfiled Items". Accepted: filing it into a plugin-created collection would add a permanent left-pane entry, which is more intrusive than one unfiled row.

---

## Phase 2: Existing libraries, sync, and trash safety

**Outcome:** Libraries that already hold storage notes converge on the container without user action, and trashing the container tells the user what it costs instead of silently emptying their mindmap list.

Tasks:

- [x] Startup migration: reparent every `STORAGE_TAG` note with a null `parentItemID` into the container, in one transaction, idempotent — done when: a library seeded with two top-level storage notes shows both as container children after startup, note keys and content unchanged, and a second startup is a no-op
      Context:
- [x] Trashed-container detection at startup: if the only container is in the trash, warn via `ztoolkit.ProgressWindow` and do not create a replacement, so a later write cannot orphan the trashed data behind a fresh empty container — done when: trashing the container and restarting produces a warning and leaves the trashed container untouched, with no second container created
      Context:
- [x] Trash-time warning: a notifier observer on the container's trash event warns immediately that every mindmap in the library is hidden until it is restored. The observer must not await the storage queue (`storage.ts:390-398`) — done when: trashing the container from the library UI shows the warning in the same session, and the queue still accepts writes afterwards
      Context:
- [x] Duplicate-container reconciliation for the two-devices-each-created-one case: adopt the lowest-key container, reparent stray children into it, erase the emptied duplicates — done when: a library seeded with two tagged containers ends with one container owning all storage notes
      Context:
- [x] `deleteMindmap` erases the container once its last storage-note child is gone, erasing rather than trashing for the reason already documented at `storage.ts:450` — done when: deleting the only mindmap leaves no plugin rows in the library
      Context:
- [x] Tests in `test/mindmap/storage.test.ts` covering migration, trashed-container detection, duplicate reconciliation and container cleanup — done when: `npm run test:fast` passes with the new cases
      Context:

Unknowns:

- [RISK] Trashing the container hides its children from `Zotero.Search` — confirmed at `search.js:1281`, where child notes of deleted items are excluded unless `includeDeleted` is set. This is the existing trashed-note silent-loss hazard with a wider blast radius: one trash action, every mindmap in the library. Accepted: warn at trash time and at startup, never un-trash. Trash-then-empty stays unrecoverable, same as the per-note hazard the codebase already accepts.

---

## Phase 3: Verification and doc reconciliation

**Outcome:** The change is verified against a live Zotero, and the charter describes the mechanism the project actually builds.

Tasks:

- [x] Full manual verification per CLAUDE.md: build, lint, `test:fast`, then a live `npm start` pass covering create, delete, trash and restart — done when: each protocol step is run and its result recorded
      Context:
- [x] Update `PRODUCT.md:17` — the line currently promises custom item-tree filtering exposed as an opt-in settings toggle. Replace it with the container approach, its one-visible-row trade-off, and the fact that the remaining toggle (TASK-32) is on by default, so hiding is opt-out rather than opt-in — done when: the charter matches the code and the TASK-32 default
      Context:

Unknowns:

- Editing `project/PRODUCT.md` from a background session is blocked by bgIsolation; the text may have to be handed over to paste manually.

---

## Phase 4 (TASK-32, Low): hide the container row

**Outcome:** A default-on preference hides the single container item from the item tree, degrading to a visible row rather than a broken tree if Zotero changes underneath it.

Tasks:

- [x] Add `hideMindmapNotes` (default `true`) to `addon/prefs.js`, currently empty, so the scaffold regenerates `typings/prefs.d.ts` and `getPref`/`setPref` are typed — done when: `getPref("hideMindmapNotes")` returns `true` on a clean profile with no UI interaction
      Context:
- [x] Patch `Zotero.CollectionTreeRow.prototype.getSearchObject` in a new `libraryFilter.ts`: call through to the original, then wrap the returned search in a fresh `Zotero.Search` scoped to it with `addCondition("tag", "isNot", CONTAINER_TAG)`. Register on main-window load, restore the original on shutdown for hot-reload safety. Wrap the patch body so any throw falls back to the unpatched result — done when: with the pref on, the container row is absent from My Library; with the patch forced to throw, the row reappears and the item tree still renders
      Context:
- [x] Add the checkbox to the existing preferences pane (`addon/content/preferences.xhtml` currently holds only the link-types groupbox) with new `preferences.ftl` keys, writing through `setPref` and refreshing open item-tree panes so the change lands without a restart — done when: toggling the checkbox shows and hides the container row in an open window, and the state survives reopening the pane
      Context:

Unknowns:

- [RISK] `getSearchObject` is undocumented internal API. It is present and unchanged in 10.0-beta.25, but `itemTree.js` was refactored to a `rowProvider` in that same beta, so the neighbourhood is moving. Accepted: the fail-open wrapper caps the worst case at one visible row.
- Hiding the container also hides it from the item-tree quicksearch, so a user troubleshooting cannot find it by name while the pref is on. The pref is the escape hatch.

---

## Open decisions

Resolved during planning, recorded here so execution does not reopen them:

- TASK-32 ships the single-row hide with the pref **on by default** (opt-out), not the opt-in toggle PRODUCT.md:17 currently describes. PRODUCT.md changes to match in Phase 3.
- The container is erased when the last mindmap in its library is deleted.
- The trash guard warns and never un-trashes, at trash time and at startup.
