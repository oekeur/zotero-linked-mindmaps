# Container guard reference

Every exported symbol in `src/modules/mindmap/containerGuard.ts`. This module keeps each library's storage notes under one container item and warns the user when that container, or a single storage note, is trashed. The reconciliation work itself lives in `reconcileContainer` (see [storage-reference.md](storage-reference.md)); this module drives it across libraries and owns the notifier.

## `warn`

```ts
function warn(text: string): void;
```

Shows `text` in a `ztoolkit.ProgressWindow` titled with the addon name, with `closeOnClick: true` and `closeTime: -1`, so it stays on screen until the user clicks it. Line type is `"fail"`.

Exported rather than private because `mindmapTab.ts` reports the same situation from a different entry point: when it declines to create a library's first mindmap because the data is in the trash, it calls this with the `mindmap-data-trashed-open` string.

## `reconcileContainers`

```ts
function reconcileContainers(): Promise<void>;
```

Runs `reconcileContainer` once per library the user can write to, and warns about any whose container is in the trash.

Iterates `Zotero.Libraries.getAll()` and skips every library whose `editable` flag is false, so read-only group libraries are left alone. For each remaining library it awaits `reconcileContainer(library.libraryID)`; a `"trashed"` result raises a warning built from the `container-trashed-startup` locale string.

Never rejects. A throw from any one library is caught, logged through `logFailure` (`Zotero.logError`, see [logging-reference.md](logging-reference.md)) with that library's id, and the loop moves on.

Libraries are processed one at a time, in `getAll()` order, and each call goes through the storage queue.

Called from `onStartup` in `src/hooks.ts`, after every main window has loaded. Idempotent, so a second run in the same session writes nothing.

Side effects: may create a container item, reparent storage notes, and erase emptied duplicate containers, all through `reconcileContainer`. May show a `ztoolkit.ProgressWindow` through `warn`.

Only the container case is reported here. A library whose container is live but whose storage note is in the trash reconciles to `"ok"`, so a note trashed in an earlier session raises nothing at startup.

## `registerContainerObserver`

```ts
function registerContainerObserver(): string;
```

Registers a `Zotero.Notifier` observer on type `"item"` under the id `zoterolinkedmindmaps-container-guard`, and returns the registration handle Zotero hands back.

The observer's `notify` returns `void`, not a promise, and must keep doing so. Zotero awaits every observer inside the commit of the transaction that fired the notification, so an observer that awaits a storage-queue write wedges the queue for the session (see [notifier-queue-explanation.md](notifier-queue-explanation.md)). Nothing in this observer touches the queue.

What it does: ignores every event other than `"trash"` on type `"item"`. For a trash event it starts a detached async task that loads each notified id with `Zotero.Items.getAsync` and skips anything that is missing or not `deleted`. The `deleted` check is what separates "moved to trash" from "taken back out of it", since Zotero fires the same event on restore.

Of what remains, an item tagged `CONTAINER_TAG` warns with `container-trashed-now` and returns immediately, abandoning the rest of the batch. An item tagged `STORAGE_TAG` sets a flag; once the loop finishes without having seen a container, the flag warns with `storage-note-trashed-now`.

The container short-circuit is why one batch never produces two popups. Trashing a container takes every note under it out of reach, so the container message is the accurate one even when the same batch also names notes, and the per-note message would understate what just happened.

Errors inside the detached task are caught and logged through `logFailure`.

Called from `onStartup`; the returned handle is held in `hooks.ts` and passed to `unregisterContainerObserver` on shutdown.

## `unregisterContainerObserver`

```ts
function unregisterContainerObserver(id: string): void;
```

Passes `id` to `Zotero.Notifier.unregisterObserver`. Called from `onShutdown`. See [lifecycle-reference.md](lifecycle-reference.md).
