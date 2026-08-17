# Zotero's stdout is piped and thrown away, so there is no log to read

**Repo:** `zotero-plugin-dev/zotero-plugin-scaffold`
**Location:** `src/utils/zotero-runner.ts:159-198`
**Evidence:** source-confirmed at HEAD and in the installed 0.8.8 bundle
**Severity:** no plugin log exists outside Zotero's own UI, which blocks headless debugging entirely

## What the code does

```ts
// Using `spawn` so we can stream logging as they come in, rather than
// buffer them up until the end, which can easily hit the max buffer size.
this.zotero = spawn(this.options.binary.path, args, { env });
logger.debug(`Zotero started, pid: ${this.zotero.pid}`);

// Handle Zotero log, necessary on macOS
this.zotero.stdout?.on("data", (_data) => {});
```

The comment says the point of `spawn` is to stream logs. The handler discards
every chunk. The second comment explains why the handler exists at all: draining
the pipe so a full buffer cannot block the child. That is a real requirement, but
draining and discarding are not the same thing.

`stderr` gets no handler at all.

## Consequence

There is no way to get Zotero's output, including anything a plugin writes with
`Zotero.debug`, into a file or into the terminal running `npm start`. The launch
args (`src/utils/zotero-runner.ts:161-179`) do not include `-ZoteroDebugText`
either, and there is no option to add it other than `binary.args`.

What remains is the Debug Output panel inside the running Zotero. That is
unusable in three situations this project hit repeatedly:

- a plugin whose `startup()` throws, where the window may not reach a state where
  the panel is reachable
- headless CI runs, where there is no UI at all
- an agent or script driving the build, which cannot read a GUI panel

This is the direct cause of a chunk of the debugging protocol in this project's
CLAUDE.md, including the technique of replacing `Zotero.debug()` calls with
`alert()` to confirm execution flow. Reaching for a modal dialog as a logging
mechanism is a symptom of having no log.

## What good looks like

Pipe the data somewhere instead of dropping it:

- forward chunks to `logger.debug`, so `--verbose` runs show Zotero's output
- and/or write to a file under the scaffold's own directory, for example
  `.scaffold/zotero.log`, with an option for the path

Both keep the pipe drained, which is what the current handler is for, so the
stated reason for the empty function is preserved.

`stderr` should get the same treatment. Right now it is unhandled, which means
the default behavior applies and nothing routes it anywhere useful either.

Adding `-ZoteroDebugText` to the launch args, or exposing an option that does,
would make the stream contain the plugin debug output people actually want. Worth
checking against Zotero's own argument handling before assuming it applies to a
plugin-hosting run.

## Note on scope

This is a feature gap rather than a defect: nothing is broken, and the empty
handler is deliberate. It is filed because the cost is high and hidden, and
because the fix is a few lines in a place that already has the data in hand.
