# Container guard reference

Every exported symbol in `src/modules/mindmap/containerGuard.ts`. This module keeps each library's storage notes under one container item and warns the user when that container is trashed. The reconciliation work itself lives in `reconcileContainer` (see [storage-reference.md](storage-reference.md)); this module drives it across libraries and owns the notifier.

## `reconcileContainers`

```ts
function reconcileContainers(): Promise<void>;
```

Runs `reconcileContainer` once per library the user can write to, and warns about any whose container is in the trash.

Iterates `Zotero.Libraries.getAll()` and skips every library whose `editable` flag is false, so read-only group libraries are left alone. For each remaining library it awaits `reconcileContainer(library.libraryID)`; a `"trashed"` result raises a warning built from the `container-trashed-startup` locale string.

Never rejects. A throw from any one library is caught, logged through `Zotero.debug` with that library's id, and the loop moves on.

Libraries are processed one at a time, in `getAll()` order, and each call goes through the storage queue.

Called from `onStartup` in `src/hooks.ts`, after every main window has loaded. Idempotent, so a second run in the same session writes nothing.

Side effects: may create a container item, reparent storage notes, and erase emptied duplicate containers, all through `reconcileContainer`. May show a `ztoolkit.ProgressWindow`.

The warning window is created with `closeOnClick: true` and `closeTime: -1`, so it stays on screen until the user clicks it. Its line type is `"fail"`.

## `registerContainerObserver`

```ts
function registerContainerObserver(): string;
```

Registers a `Zotero.Notifier` observer on type `"item"` under the id `zoterolinkedmindmaps-container-guard`, and returns the registration handle Zotero hands back.

The observer's `notify` returns `void`, not a promise, and must keep doing so. Zotero awaits every observer inside the commit of the transaction that fired the notification, so an observer that awaits a storage-queue write wedges the queue for the session (see [notifier-queue-explanation.md](notifier-queue-explanation.md)). Nothing in this observer touches the queue.

What it does: ignores every event other than `"trash"` on type `"item"`. For a trash event it starts a detached async task that loads each notified id with `Zotero.Items.getAsync` and, on the first item that is both `deleted` and tagged `CONTAINER_TAG`, shows a warning built from the `container-trashed-now` locale string and stops. The `deleted` check is what separates "moved to trash" from "taken back out of it", since Zotero fires the same event on restore.

Errors inside the detached task are caught and logged through `Zotero.debug`.

Called from `onStartup`; the returned handle is held in `hooks.ts` and passed to `unregisterContainerObserver` on shutdown.

## `unregisterContainerObserver`

```ts
function unregisterContainerObserver(id: string): void;
```

Passes `id` to `Zotero.Notifier.unregisterObserver`. Called from `onShutdown`. See [lifecycle-reference.md](lifecycle-reference.md).
