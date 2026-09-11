# The test runner's only exit path is Zotero's own `close` event, with no watchdog

**Repo:** `zotero-plugin-dev/zotero-plugin-scaffold`
**Location:** `src/core/tester/index.ts:135-146`, `src/core/tester/test-bundler.ts:136`, `src/core/tester/test-bundler-template/raw/mocha-setup.js:114-133`
**Evidence:** source-confirmed at HEAD; no timeout exists anywhere in the tester
**Severity:** a run whose results are already known can hang indefinitely

## Correction first

An earlier version of this analysis claimed that a local `npm test` hanging open
was this bug. That was wrong, and the wrong diagnosis is worth recording because
it is easy to repeat.

`zotero-plugin test` defaults to **watch mode**. The CLI computes:

```ts
// src/cli.ts:63
watch: !options.exitOnFinish && options.watch,
```

`options.watch` defaults to true, so a plain `zotero-plugin test` stays open by
design and keeps Zotero alive for the next file change. `isCI` forces
`watch = false` (`src/core/tester/index.ts:28-31`). A local run that never exits
is therefore configured behavior, not a defect, and the fix for that is
`--no-watch` in the npm script.

What remains after removing that misreading is a smaller, real gap.

## The real gap

With watch off, `exitOnFinish` is true (`test-bundler.ts:136`:
`exitOnFinish: !this.ctx.test.watch`), and the in-Zotero mocha setup asks Zotero
to quit itself when the run ends:

```js
runner.on("end", async function () {
  ...
  await send({ type: "end", data: { passed, failed, aborted, str, indents } });

  // Must exit on Zotero side, otherwise the exit code will not be 0 and CI will fail
  if (__EXIT_ON_FINISH__) {
    Zotero.Utilities.Internal.quit(0);
  }
});
```

On the Node side, the only thing that ends the process is Zotero's exit:

```ts
this.zotero.zotero?.on("close", () => this.onZoteroExit());

private onZoteroExit = () => {
  this.reporter.stop();
  this.ctx.hooks.callHook("test:exit", this.ctx);

  if (this.reporter.failed)
    process.exit(1);
  else
    process.exit(0);
};
```

There is no timeout. Grepping the tester for `setTimeout` returns nothing.

So if `Zotero.Utilities.Internal.quit(0)` does not complete, the CLI waits
forever. Reasons it might not: a modal dialog left open by a test, a plugin
`shutdown()` that throws or blocks, a hung XPCOM shutdown, a GUI stall. The
results are already in hand at that point, since the reporter received the `end`
event and printed `Test run completed - N passed`, so the process is blocking on
cleanup it does not need in order to report.

In CI that means a job that burns its full time limit instead of failing or
passing immediately with the answer it already has.

## Fix

On the reporter's `end` event, when `exitOnFinish` is set, start a grace timer.
If Zotero has not closed by then, call `this.zotero.exit()` and exit with the
code derived from `this.reporter.failed`. A few seconds is enough, since the only
work left is Zotero quitting.

That keeps the current happy path (Zotero exits, `close` fires, exit code from
the reporter) and adds a bound. It also removes the need for downstream projects
to reimplement it.

## What this project built instead

`scripts/run-tests.mjs` wraps `zotero-plugin test`, watches stdout for the
`Test run completed - N passed[, M failed]` line, force-kills Zotero, and exits
with the matching code. It carries its own 240s launch-to-completion timeout for
the case where the line never appears at all.

Part of that script is compensating for the missing `--no-watch` in this repo's
own npm script, which is this project's bug rather than the scaffold's. The part
worth upstreaming is the bound on the exit path.

There is one more reason a wrapper was attractive: parsing the completion line
gives pass and fail counts, and the CLI's exit code alone does not distinguish "0
tests ran because startup failed" from "everything passed". That is a separate
observation and not part of this finding.
