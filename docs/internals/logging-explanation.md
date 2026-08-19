# Why failures log through Zotero.logError, not Zotero.debug

The plugin logs failures inside catch blocks, all prefixed `[zoteroLinkedMindmaps]`. Before this note, every one of them went through `Zotero.debug(message)`, which is level 3 by default and carries no severity above it.

`Zotero.debug` output is captured only while debug logging is already on (Help -> Debug Output Logging, or the `extensions.zotero.debug.log`/`debug.store` prefs). The ordinary bug-report sequence is: the user hits the bug, then reads the issue form, then enables logging, then can't reproduce it. Every line from the original failure is already gone by the time the form asks for it.

## The probe

`node_modules/zotero-types/types/zotero.d.ts` declares `Zotero.logError(err)` as reaching "the Mozilla error console and debug output," which reads as the property that would let an error survive without debug logging pre-enabled. That's a claim from a type declaration, not something this plugin had exercised - `Zotero.logError` appears nowhere in `src/` before this change.

Reading Zotero's own source (`xpcom/zotero.js` in the client's `omni.ja`) settles the mechanism:

```js
this.logError = function (err) {
  Zotero.debug(err, 1);
  this.log(err.message ? err.message : err.toString(), "error", ...);
};
```

`Zotero.debug(err, 1)` goes through `Zotero.Debug.log`, which is gated exactly like every other `Zotero.debug` call: `if (!this.enabled) return;`, and storage into the Debug Output buffer is separately gated on the `debug.store` pref. That half of `logError` is lost under the same conditions as a plain `Zotero.debug` call.

The second half, `this.log(...)`, does not go through `Zotero.Debug`. It builds an `nsIScriptError` and calls `Services.console.logMessage(scriptError)` - the Mozilla console service, not Zotero's own debug buffer. Zotero registers a listener on that service unconditionally, in `Zotero.init()`, before any debug-logging preference is read:

```js
Services.console.registerListener(ConsoleListener);
```

`ConsoleListener` appends every message that passes `_shouldKeepError()` to `_recentErrors`, an in-memory ring buffer capped at 25 entries. `Zotero.getErrors(true)` reads that buffer (plus the startup errors captured the same way at launch) and returns it as an array of strings. Nothing in that path checks `debug.log` or `debug.store`.

So `Zotero.logError(err)` writes to two independent destinations: the gated `Zotero.debug` path, and the ungated Mozilla console path. Only the second is guaranteed to survive a bug report where debug logging was never turned on.

## Confirming it live, not just in source

Source reading establishes the mechanism; it doesn't rule out something else clearing the buffer, a build-specific patch, or a timing assumption that doesn't hold at runtime. `test/logging.test.ts` drives the actual claim against a live Zotero instance launched by `npm run test:fast`, with `debug.log` and `debug.store` confirmed off first:

```ts
Zotero.logError(new Error(marker));
await new Promise((resolve) => setTimeout(resolve, 200));
const errors = Zotero.getErrors(true) as string[];
assert.isTrue(errors.some((e) => e.includes(marker)));
```

The delay matters and is itself a finding, not incidental: the same assertion run with no delay at all failed - `Services.console.logMessage` does not make the listener callback (and therefore `_recentErrors`) visible to a synchronous read that immediately follows it. 200ms was sufficient in every run during this work; there is no documented guarantee from Mozilla's console service about the actual bound, so treat 200ms as "long enough in practice," not as a proven ceiling.

**Finding: confirmed.** `Zotero.logError` output is retrievable via `Zotero.getErrors()` without debug logging having been enabled before the failure, subject to a short (sub-second in testing) propagation delay and the 25-entry buffer cap.

## What this means for severity in this plugin

Given the finding, the two Zotero.debug-based rungs (default level 3, and the `stack` parameter on `Zotero.debug(message, level, maxDepth, stack)`) don't solve the reported problem on their own - they still require debug logging to already be on. The plugin's own severity split, in `src/utils/logging.ts`, follows the channel rather than the `Zotero.debug` level number:

- **Failure** (`logFailure`): routed through `Zotero.logError`, so it reaches `Zotero.getErrors()` regardless of whether debug logging was ever enabled.
- **Trace** (`logTrace`): a plain `Zotero.debug` call, visible only while debug logging is already on. Used for conditions that are expected and already handled, not for anything a bug reporter would need.

`Zotero.logError(err)` only forwards `err.message` to the Mozilla console, not `err.stack`. A failure logged with just a short summary ("grouping change failed") would be exactly as hard to locate in code as it was before this change, just retrievable earlier. `logFailure` folds the stack into the message text itself before constructing the `Error` it passes to `Zotero.logError`, so the stack travels through the same channel that survives.

## How a reporter actually retrieves it

Zotero ships a UI for this that isn't Debug Output: **Help -> Report Errors…**. It opens a wizard whose first page is a read-only textarea populated directly from `Zotero.getErrors(true)`, before anything is sent anywhere. A reporter can open it, copy the text, and paste it into the issue form without ever touching a debug-logging preference and without submitting to Zotero's server (the network request only fires if they click through to the next wizard page). See the rewritten `debug-output` field in `.github/ISSUE_TEMPLATE/bug_report.yml`.

## See also

- [logging-reference.md](logging-reference.md) for `logFailure`/`logTrace` signatures and the full call-site severity table.
- [polyfills-reference.md](polyfills-reference.md) for how `consolePolyfill.ts` routes bundled-library `console.error`/`console.warn` through the same helper.
