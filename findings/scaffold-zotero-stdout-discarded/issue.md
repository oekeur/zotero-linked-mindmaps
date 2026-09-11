**Title:** Zotero's stdout is piped and discarded, so there is no way to get plugin logs out of a serve or test run

### Summary

`startZoteroInstance` attaches an empty handler to the spawned Zotero's stdout
(`src/utils/zotero-runner.ts:197`):

```ts
// Using `spawn` so we can stream logging as they come in, rather than
// buffer them up until the end, which can easily hit the max buffer size.
this.zotero = spawn(this.options.binary.path, args, { env });

// Handle Zotero log, necessary on macOS
this.zotero.stdout?.on("data", (_data) => {});
```

The first comment states the intent (stream logs), the handler drops every chunk,
and the second comment explains why the handler exists (drain the pipe). Draining
is necessary; discarding is a separate choice. `stderr` has no handler at all.

Combined with no `-ZoteroDebugText` in the launch args, there is no file and no
terminal stream carrying Zotero's output, so the Debug Output panel inside the
running Zotero is the only place to read plugin `Zotero.debug()` calls.

### Why that hurts

Three cases where the panel is not usable:

- a plugin whose `startup()` throws, where the window may never reach a state
  where the panel can be opened
- headless CI, where there is no UI
- any script or agent driving the build, which cannot read a GUI panel

Our contributing docs ended up recommending that developers temporarily replace
`Zotero.debug()` calls with `alert()` to trace execution, because that is the
only output channel that survives a broken startup. Using modal dialogs as a
logging mechanism is a workaround for having no log.

### Suggested fix

Keep the pipe drained, stop dropping the data:

```ts
const forward = (data: Buffer) => {
  const text = data.toString();
  logger.debug(text); // visible under verbose
  logStream?.write(text); // optional file, e.g. .scaffold/zotero.log
};
this.zotero.stdout?.on("data", forward);
this.zotero.stderr?.on("data", forward);
```

An option for the log path, defaulting to off or to a path under the scaffold's
own directory, would cover CI and agent-driven use without changing the default
terminal output.

Separately, consider adding `-ZoteroDebugText` (or an option that does) so the
stream carries the plugin debug output people are actually looking for. We have
not verified what that flag does in a plugin-hosting run, so it is worth checking
against Zotero's argument handling rather than assuming.

### Environment

`zotero-plugin-scaffold` 0.8.8 and `HEAD` as of 2026-08-17.
