# Reproduction

This is a gap rather than a crash, so the evidence is the code plus the absence
of any alternative path.

## The discard, at upstream HEAD

```
$ gh api repos/zotero-plugin-dev/zotero-plugin-scaffold/contents/src/utils/zotero-runner.ts \
    -H "Accept: application/vnd.github.raw" | sed -n '190,198p'
    // Using `spawn` so we can stream logging as they come in, rather than
    // buffer them up until the end, which can easily hit the max buffer size.
    this.zotero = spawn(this.options.binary.path, args, { env });
    logger.debug(`Zotero started, pid: ${this.zotero.pid}`);

    // Handle Zotero log, necessary on macOS
    this.zotero.stdout?.on("data", (_data) => {});

    logger.debug("Connecting to the remote Firefox debugger...");
```

Same in the installed 0.8.8 bundle:

```
$ grep -n "stdout\|stderr" node_modules/zotero-plugin-scaffold/dist/shared/scaffold-src-bWcaMVyt.mjs
3655:		this.zotero = spawn(this.options.binary.path, args, { env });
3657:		this.zotero.stdout?.on("data", (_data) => {});
```

One `stdout` handler, empty body. No `stderr` handler anywhere in the file.

## No debug-text flag either

```
$ grep -rn "ZoteroDebugText\|jsconsole\|purgecaches" node_modules/zotero-plugin-scaffold/dist/shared/scaffold-src-bWcaMVyt.mjs | head
```

Only `--purgecaches` appears. The full arg list built by `startZoteroInstance` is:

```
["--purgecaches", "no-remote", "-profile", <path>, "--dataDir", <path>,
 (optional "--jsdebugger"), ...binary.args, "-start-debugger-server", <port>]
```

Nothing routes Zotero's debug output to a stream or a file, and the only way to
add a flag is `binary.args` in the project's own config.

## What that leaves

Verified by exhaustion while debugging this plugin:

- No log file is created anywhere under `.scaffold/`.
- `npm start` prints scaffold's own logger output only. Zotero's output does not
  appear in the terminal.
- The Debug Output panel inside the running Zotero is the only place plugin
  `Zotero.debug()` calls can be read.

## Cost, as recorded in this project

This repo's CLAUDE.md contains a verification protocol step that exists only
because of this gap:

> If Debug Output shows nothing where an error is expected, that is not proof of
> success. Temporarily swap the suspect `Zotero.debug()` calls for
> `ztoolkit.getGlobal("alert")("Reached: <location>")` and bracket the failing
> operation to confirm actual execution flow.

Using modal dialogs to trace execution is what you do when there is no log to
read. The same document notes that scaffold "discards Zotero's stdout entirely
and never passes `-ZoteroDebugText`, so there is no log-to-file mechanism today",
which is the conclusion this finding is built on and which was re-verified above.

## Not tested

Whether `-ZoteroDebugText` actually causes Zotero to emit plugin `Zotero.debug()`
output on stdout in a plugin-hosting run. That needs checking against Zotero's
own argument handling before a fix relies on it. Forwarding whatever stdout
already carries is independent of that question and useful on its own.
