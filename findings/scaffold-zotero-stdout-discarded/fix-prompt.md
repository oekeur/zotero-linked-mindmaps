# Agent prompt: forward Zotero's output instead of discarding it

You are adding a capability to `zotero-plugin-dev/zotero-plugin-scaffold`. Read
`analysis.md` and `reproduction.md` in this directory first.

## Task

`startZoteroInstance` (`src/utils/zotero-runner.ts`) drains Zotero's stdout into
an empty handler and ignores stderr, so no log of a serve or test run exists
outside Zotero's own UI. Forward the output to the logger and, optionally, to a
file.

## Steps

1. Read `src/utils/zotero-runner.ts`, especially `startZoteroInstance` and the
   `exit`/teardown path. Note the comment saying the empty handler is "necessary
   on macOS": the pipe must stay drained, so whatever you write must consume
   every chunk unconditionally, including when file logging is off.
2. Read `src/utils/logger.ts` (or wherever `logger` comes from) to see what levels
   exist and how verbosity is controlled. Zotero is chatty, so this belongs at
   the most verbose level, never at info.
3. Read `src/types/config.ts` to follow the option conventions, including the
   bilingual doc comments and how defaults are expressed. Add an option for the
   log file path. Decide the default deliberately: a path under the scaffold's own
   working directory is convenient, off-by-default is conservative. State your
   choice and why.
4. Implement forwarding for both stdout and stderr. Handle chunk boundaries so
   log lines are not split mid-line in the output. Open the file stream lazily,
   and close it on the same paths that terminate Zotero, including SIGINT.
5. Check the tester and server paths (`src/core/tester/index.ts`,
   `src/core/server.ts`) for anything that assumes stdout is silent. The tester's
   HTTP reporter writes to the CLI's own stdout, so confirm Zotero's forwarded
   output cannot corrupt the reporter's line-oriented output that other tooling
   greps for. That matters: at least one project greps for the
   `Test run completed - N passed` line to detect completion. Keep Zotero's
   output on a separate level or stream so that line stays parseable.
6. Investigate `-ZoteroDebugText` separately. Determine from Zotero's own source
   whether it makes `Zotero.debug()` output reach stdout in a plugin-hosting run.
   If it does, add it behind an option. If you cannot confirm it, do not add it,
   and say so in the PR rather than shipping a flag that might do nothing.

## Constraints

- Never leave a chunk unconsumed. The current empty handler exists for a reason.
- Do not change default terminal output. Someone running `npm start` today should
  not suddenly get Zotero's internal chatter unless they asked for it.
- Do not break the `Test run completed` line or any other output the tester emits.

## Definition of done

- With the new option on, a serve run produces a file containing Zotero's output,
  and the file is closed cleanly on exit and on SIGINT.
- With verbose logging on, the same output appears through `logger`.
- With everything off, behavior matches today, and the pipe is still drained.
- A test run's reporter output remains byte-identical for the lines other tools
  parse.
