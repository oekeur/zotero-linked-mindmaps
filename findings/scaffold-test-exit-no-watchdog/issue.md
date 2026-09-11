**Title:** `zotero-plugin test` has no fallback if Zotero fails to quit, so a finished run can hang forever

### Summary

With `exitOnFinish` set (that is, `--no-watch` or CI), the in-Zotero mocha hook
calls `Zotero.Utilities.Internal.quit(0)` when the run ends, and the Node side
exits only from the child's `close` event:

```ts
// src/core/tester/index.ts:135-146
this.zotero.zotero?.on("close", () => this.onZoteroExit());

private onZoteroExit = () => {
  this.reporter.stop();
  this.ctx.hooks.callHook("test:exit", this.ctx);
  if (this.reporter.failed) process.exit(1);
  else process.exit(0);
};
```

There is no timeout anywhere in the tester (`grep setTimeout src/core/tester`
returns nothing). If Zotero does not quit, for example because a test left a
modal open or a plugin's `shutdown()` blocks, the CLI waits indefinitely even
though the results are already in: the HTTP reporter received `end` and printed
`Test run completed - N passed` before the quit was even attempted.

In CI that turns a completed run into a job that burns its full time limit.

### Not the same as watch mode

Worth stating, because it is easy to conflate: a plain local `zotero-plugin test`
staying open is intended behavior. `src/cli.ts:63` computes
`watch: !options.exitOnFinish && options.watch` with `watch` defaulting to true,
and `isCI` forces it false. This issue is only about the `exitOnFinish` path
having no fallback.

### Order of events

1. mocha finishes, the in-Zotero reporter POSTs `{ type: "end", ... }`
2. the CLI's reporter prints `Test run completed - N passed[, M failed]`
3. the in-Zotero hook calls `Zotero.Utilities.Internal.quit(0)`
4. the CLI waits for `close`, with no bound

Steps 1 and 2 mean the exit code is fully determined before step 3 begins.

### Suggested fix

On the reporter's `end` event, when `exitOnFinish` is set, start a short grace
timer. If the child has not closed when it fires, call `this.zotero.exit()` and
`process.exit(this.reporter.failed ? 1 : 0)`. A few seconds is ample, since the
only remaining work is Zotero quitting. Log that the fallback fired, so a
genuinely stuck shutdown is still visible rather than silently papered over.

### Why we care

We wrote a wrapper script for this: it runs `zotero-plugin test`, watches stdout
for the completion line, kills Zotero, and exits with the matching code, plus its
own launch-to-completion timeout for the case where the line never appears.
Roughly 60 lines to bound something the tester already has all the information to
bound itself. Happy to send the upstream version as a PR.

### Environment

`zotero-plugin-scaffold` 0.8.8 and `HEAD` as of 2026-08-17.
