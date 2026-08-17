# Agent prompt: bound the test runner's exit path

You are adding a watchdog to `zotero-plugin-dev/zotero-plugin-scaffold`. Read
`analysis.md` and `reproduction.md` in this directory first. `analysis.md` opens
with a correction to an earlier misdiagnosis; read it, because the obvious
symptom (a local test command that stays open) is intended watch-mode behavior
and not what you are fixing.

## Task

When `exitOnFinish` is set, the tester's only exit path is the spawned Zotero's
`close` event. If Zotero fails to quit, the CLI hangs forever despite already
having the results. Add a bounded fallback.

## Steps

1. Read `src/core/tester/index.ts` in full: the constructor's CI handling,
   `run()`, `startZotero()`, `onZoteroExit`, `exit()`, and the watch path.
2. Read `src/core/tester/http-reporter.ts`, specifically the `end` case and the
   `passed`/`failed` state it maintains. That is where the run's outcome becomes
   known, and it is the trigger you want.
3. Read `src/core/tester/test-bundler.ts:136` and
   `src/core/tester/test-bundler-template/raw/mocha-setup.js` to confirm how
   `exitOnFinish` reaches the in-Zotero side and what it does. The fallback must
   only arm when that flag is set; in watch mode Zotero is supposed to stay alive.
4. Implement the watchdog. On `end`, if `exitOnFinish`, start a timer. If the
   child is still alive when it fires, log that the fallback is firing, call
   `this.zotero.exit()`, and `process.exit(this.reporter.failed ? 1 : 0)`. Clear
   the timer if `close` arrives first, and make sure the timer cannot keep the
   Node process alive on its own (`unref` it).
5. Pick the grace period and justify it. The only remaining work is Zotero
   quitting, so single-digit seconds is right. Consider whether it needs to be
   configurable; prefer a constant unless there is a real reason.
6. Do not double-exit. `onZoteroExit` and the watchdog can race. Guard with a
   single settled flag so hooks like `test:exit` fire exactly once.
7. Check the SIGINT path in `exit()` still behaves, and that `reporter.stop()` is
   called on every route out.

## Constraints

- Watch mode behavior must not change at all.
- The happy path must keep exiting from `close`, with the code derived from the
  reporter. The watchdog is a fallback, not the new primary mechanism.
- When the fallback fires, say so in the output. A silently killed Zotero would
  hide a genuinely stuck shutdown, which is worth knowing about.
- Do not change the exit-code semantics: 0 for a clean pass, 1 for any failure.

## Verification

A stuck shutdown can be forced: make the test plugin's `shutdown()` await a
promise that never resolves, then run with `--no-watch`. Before the fix the CLI
hangs after the completion line; after it, the CLI exits within the grace period
with the right code and a log line saying the fallback fired.

Also confirm the ordinary case is unchanged: with `--no-watch` and a healthy
plugin, exit still comes from `close`, and no fallback message appears.

## Definition of done

- A forced stuck shutdown exits within the grace period, with the correct code.
- Ordinary `--no-watch` runs are byte-identical in output apart from nothing.
- Watch mode still keeps Zotero alive and reloads on file changes.
- Hooks fire once per run on every path.
