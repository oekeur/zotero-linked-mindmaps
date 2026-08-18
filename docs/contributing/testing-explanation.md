# Why the tests look like this

The suite has three unusual properties. It runs inside a real Zotero rather than against a mock, it is wrapped in a script that kills the browser process, and it covers a minority of the codebase on purpose. Each one follows from a constraint of the platform.

## Live Zotero instead of a mocked API

Almost everything the plugin does is a call into Zotero. Storage is a note item carrying a JSON blob, found by tag, saved through `saveTx()` inside a transaction, and hung off a container item. Deletion cleanup listens to `Zotero.Notifier`. The graph tab is a `Zotero_Tabs` entry. The Mindmaps section is registered through `itemPaneManager`. A mock of that surface would amount to a second implementation of Zotero's data layer, and the failures worth catching are precisely the ones where Zotero's real behavior differs from what the code assumed.

Those differences are the bugs that have actually happened here. Zotero re-serializes note HTML asynchronously after a save, which lands after a same-tick overwrite and restores the old content; a mock that wrote back the string you gave it would never show that. `Zotero.Notifier` fires twice for one save, once inside the transaction and once a macrotask later. Delete notifications carry item IDs instead of keys, and arrive after `eraseTx()` has already resolved. Cytoscape piles every node at the origin when its container measures 0 by 0, which a headless probe with a synthetic container won't reproduce. A fake gets you to none of these.

The cost is real. Each run boots a browser, so the floor is seconds rather than milliseconds. Tests have to clean up after themselves in a shared library, which is why `clearStorageNotes()` exists and why suites call it on both ends. Some tests wait on Zotero's own timing and raise their timeout to 30 seconds, because there is no way to make the wait shorter.

`zotero-plugin test` keeps that cost bounded by throwing away state between runs. `.scaffold/test/profile`, `.scaffold/test/data`, and `.scaffold/test/resource` are emptied at the start of every run, and both are resolved relative to the working directory. The debugger port and the reporter port are both allocated free at launch. Two checkouts can therefore run the suite at the same time without interfering.

## Why test:fast exists

`zotero-plugin test` runs a Mocha reporter inside Zotero that POSTs each event back to the CLI process over HTTP. On the `end` event the CLI prints `Test run completed - N passed`, and when `exitOnFinish` is set it tells Zotero to quit, which ends the Node process.

Two things stop that from being the whole story locally.

The scaffold derives `exitOnFinish` as `!watch`, and `watch` defaults to true. Run `npm test` with no flags on a developer machine and the runner deliberately doesn't quit. It holds Zotero open and re-runs the suite on changes to `src/` or `test/`. Under CI the runner forces `watch` to false and `headless` to true, so the process exits on its own with the right code. The version of this story recorded in `CLAUDE.md` blames the non-exit on a hung GUI; reading the scaffold's own source, watch mode is the ordinary cause, and no flag in `package.json` turns it off.

Separately, when Zotero is asked to quit, the GUI does sometimes fail to actually exit, and nothing on the Node side then forces the issue. A run whose tests all finished can sit open until you happen to notice.

`scripts/run-tests.mjs` sidesteps both by not depending on Zotero's exit at all. It spawns `npx zotero-plugin test` detached, so the run gets its own process group, watches stdout for the same completion line the reporter already prints, and on seeing it SIGKILLs that whole group and exits 1 if the line reported failures or 0 if it didn't. The exit-code contract matches `npm test` under CI. It simply doesn't gamble on the process ending itself.

The wrapper's 240-second timer is a different mechanism aimed at a different failure. It counts from launch, so it has to cover the whole suite, and it exists to catch a plugin that never initializes at all rather than to police how long the suite takes. Exceeding it is a genuine hang and reports as a failure.

Killing by process group rather than by name is what makes this safe to run next to anything else. The wrapper used to clean up with `pkill -9 -f zotero-bin`, which matched every Zotero on the machine: a dev instance from `npm start`, a test run in another worktree, your own library. A group kill reaches only the processes this run started, so `test:fast` and `npm start` can now be up at the same time.

The limit of the technique is that a child which puts itself in a new session escapes the group. Zotero does not, which is why this works, but it is the thing to check first if a run ever leaves a process behind.

## What is not tested, and what replaces it

Three areas aren't practically unit-testable here.

XUL rendering, because the elements only exist inside a real main window and their behavior depends on Zotero's own CSS and l10n context. `mindmapTabLive.test.ts` gets partway there by opening the real tab and querying the main document, which catches raw Fluent ids leaking through untranslated and layouts that only hold together against detached elements. It catches nothing visual.

Cytoscape layout, because layout output depends on the container's measured size. A headless probe with a synthetic container spreads nodes plausibly while a real 0-by-0 container piles them all at the origin, so a passing headless assertion tells you nothing about the running plugin.

Live Zotero API interop where the plugin patches core behavior instead of calling it. The library-row filter monkey-patches `Zotero.CollectionTreeRow` because Zotero exposes no API for hiding rows from the item tree. There is no stable seam to assert against, and a Zotero upgrade can change the shape underneath it. See [library-filter-explanation.md](../internals/library-filter-explanation.md).

For these the project relies on a manual verification pass instead of pretending coverage exists. The order is cheapest-first. Run `npm run build` and `npm run lint:check`, which catch type and lint errors without booting anything. Run `npm run test:fast`, which is a real pass/fail signal on whether the plugin initialized, as opposed to eyeballing. Then confirm the plugin appears under Tools, then Plugins, because a `strict_max_version` mismatch blocks loading with no console error and no install failure. Then exercise the change by hand.

That sequence exists because the failure modes in this codebase have mostly been silent rather than thrown. A wrong `repository.url` or `homepage` in `package.json` breaks install with no build-time signal. A stale custom-tab entry in `session.json` crashes Zotero's session restore before the plugin loads, with an error inside core `tabs.js` that names nothing of yours. A version ceiling that is too low produces a plugin that never appears at all. See [configuration-reference.md](./configuration-reference.md) for the full list of fields that fail this way.

## The honest limitation: no log to tail

`ZoteroRunner.startZoteroInstance` attaches an empty handler to the child's stdout (`this.zotero.stdout?.on("data", (_data) => {})`) and never passes `-ZoteroDebugText`. Zotero's output is discarded, and there is no file to tail.

That leaves you two signals. The streamed test output, which only covers what the suite exercises. And Zotero's Debug Output panel (Help, then Debug Output), which is where "Error running bootstrap method" shows up when startup throws.

Debug Output showing nothing is not proof that nothing went wrong, since console output can be filtered or misrouted. When you need to know whether a line actually ran, put `ztoolkit.getGlobal("alert")("Reached: <location>")` around the suspect operation. It is intrusive and unmissable, which is exactly the point.
