# Running the tests

The suite runs inside a live Zotero. Every run builds the plugin, launches Zotero against a throwaway profile, and executes `test/**/*.test.ts` there. [testing-explanation.md](./testing-explanation.md) covers why it works this way.

## Run the suite once

```sh
npm run test:fast
```

Expect roughly ten seconds for the common case: build, launch, run, exit. Output is one line per test as results stream back, then a summary line:

```
Test run completed - 87 passed
```

Exit code 0 means every test passed, 1 means at least one failed or the run hung. `test:fast` kills Zotero the moment that summary line appears instead of waiting around for the GUI to quit.

## Run the suite in watch mode

```sh
npm test
```

`zotero-plugin test` defaults to watch mode. Zotero stays open after the suite finishes and re-runs it whenever a file under `src/` or `test/` changes. The command never returns to your shell, and that's watch mode working rather than a hang. Stop it with Ctrl-C, then check for a leftover process (see below).

Reach for this while you're iterating on a failing test. Reach for `test:fast` for a single verification pass, in a script, or anywhere you need an exit code.

## Run the tests while a dev Zotero instance is open

`npm test` is safe alongside `npm start`. The test runner uses its own profile and data directories, `.scaffold/test/profile` and `.scaffold/test/data`, both resolved relative to the current working directory and both emptied at the start of every run. It picks a free TCP port for the debugger server and another for the reporter, so nothing collides with the dev instance.

`npm run test:fast` is not safe alongside `npm start`. Its cleanup step is `pkill -9 -f zotero-bin`, which matches every Zotero process on the machine, your dev instance included. It will take that down with it, and it won't warn you first.

So: dev instance running, use `npm test`. No dev instance running, use `npm run test:fast`.

## Read a failure

A failed assertion prints the test title, the error message, and both values:

```
✖ round-trips a document through write then read without data loss, expected { ... } to deeply equal { ... }
  Expected: {...}
  Received: {...}
```

Two other failure shapes aren't assertion failures at all, and they read differently.

A run that produces no test output whatsoever and then times out means the plugin never finished starting. `zotero-plugin.config.ts` sets `waitForPlugin` to `() => Zotero.ZoteroLinkedMindmaps.data.initialized`, and the runner polls that in the live instance before handing over to Mocha. `src/hooks.ts` sets the flag as the last statement of `onStartup`, so anything that throws earlier in startup leaves it false and the run fails. `test/startup.test.ts` asserts the instance exists, and it's the smallest signal you have that the plugin loaded at all.

A `ReferenceError` naming a browser global (`document`, `console`, `Image`, `ResizeObserver`, `MutationObserver`) comes from a bundled library assuming a browser scope that Zotero's plugin sandbox doesn't provide. Go and read the failing line in `node_modules/<pkg>/dist/*.js` instead of inferring what it wants; see [polyfills-reference.md](../internals/polyfills-reference.md) for what the plugin already patches in.

Be aware that there's no log file to tail. `zotero-plugin-scaffold` discards Zotero's stdout, so the streamed test output and Zotero's own Debug Output panel (Help, then Debug Output) are the only two places anything shows up.

## Clean up leftover processes

`npm test` interrupted with Ctrl-C can leave the test Zotero running. Kill only that one, not your dev instance:

```sh
pkill -f "scaffold/test/profile"
```

Kill everything, dev instance included, when nothing else works:

```sh
pkill -9 -f zotero-bin
```

`npm start` already runs the second command through its `prestart` hook, so a stale process left behind before a `npm start` gets cleared automatically. See [npm-scripts-reference.md](./npm-scripts-reference.md#cleanprofile).

## Keep storage notes from leaking between suites

The plugin stores each mindmap as a JSON blob in a tagged Zotero note, hanging off a container item. `readMindmapDocument()` creates a default storage note when it doesn't find one, so a test that merely reads, or that opens a UI surface which reads (the add-link form does), leaves a note behind in the shared test library. Tests look up by mindmap id, so a note left over from an earlier file makes an id-less lookup in a later file resolve to the wrong document. The failure then lands in whichever suite Mocha happens to run next, nowhere near the one that caused it. That is an unpleasant afternoon if you don't know to look for it.

`test/mindmap/storageNotes.ts` exports the cleanup:

```ts
import { clearStorageNotes } from "./storageNotes";
```

`clearStorageNotes()` erases every mindmap storage note in the library and every container, trashed containers included. The trashed ones matter more than they look: a test that trashes a container to exercise the trash guard would otherwise leave it sitting there, blocking every later test from getting a container at all.

Call it on both ends of any suite that reads or writes mindmap storage:

```ts
describe("mindmap/storage", function () {
  beforeEach(async function () {
    await clearStorageNotes();
  });

  after(async function () {
    await clearStorageNotes();
  });
});
```

`beforeEach` protects you from whatever ran before, and the trailing hook protects the next file from you. Eight of the current test files do this.

## Conventions in the existing tests

Tests import from `src/` by relative path (`../../src/modules/mindmap/storage`) and assert with Chai's `assert`. They construct real Zotero objects, `new Zotero.Item("journalArticle")`, `saveTx()`, `eraseTx()`, in preference to fakes.

The test bundle is a separate copy of the module graph from the running plugin, with no `ztoolkit` and no `addon` global of its own. Tests that need them read them off the live instance, the way `mindmapTabLive.test.ts` does:

```ts
const instance = (Zotero as any)[config.addonInstance];
(globalThis as any).addon = instance;
(globalThis as any).ztoolkit = instance.data.ztoolkit;
```

The Mocha timeout is 10000 ms by default. Tests that drive the real tab or wait on Zotero's notification timing raise it per test with `this.timeout(30000)`.

Tests that write storage and then read it back wait on `whenStorageIdle()` from `src/modules/mindmap/storage`, because writes go through a queue. See [notifier-queue-explanation.md](../internals/notifier-queue-explanation.md).
