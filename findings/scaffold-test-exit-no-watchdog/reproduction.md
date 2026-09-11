# Reproduction

This one is documented from source rather than triggered on demand, because
forcing Zotero to fail to quit is not deterministic. What is verifiable, and was
verified, is that no bound exists on the exit path.

## Watch mode is the default, and is not the bug

```
$ gh api repos/zotero-plugin-dev/zotero-plugin-scaffold/contents/src/cli.ts \
    -H "Accept: application/vnd.github.raw" | sed -n '53,66p'
  cli.command("test")
    .description("Run tests")
    .option("--abort-on-fail", "Abort the test suite on first failure")
    .option("--exit-on-finish", "Exit the test suite after all tests have run")
    .option("--no-watch", "Exit the test suite after all tests have run")
    .action(async (options) => {
      process.env.NODE_ENV = "test";
      await runCommand(Test, {
        test: {
          abortOnFail: options.abortOnFail,
          watch: !options.exitOnFinish && options.watch,
        },
      });
    });
```

`watch` defaults to true (`src/types/config.ts:697-700`, `@default true (false in
ci)`), and the constructor forces it off under CI:

```
$ gh api .../src/core/tester/index.ts -H "Accept: application/vnd.github.raw" | sed -n '28,32p'
    if (isCI) {
      this.ctx.test.headless = true;
      this.ctx.test.watch = false;
    }
```

So a plain local `zotero-plugin test` is meant to stay open. Any report of "the
test command hangs locally" should be checked against this first.

## No timeout on the exit path

```
$ gh api .../src/core/tester/index.ts -H "Accept: application/vnd.github.raw" \
    | grep -n "setTimeout\|timeout\|watch"
8:import { watch } from "../../utils/watcher.js";
30:      this.ctx.test.watch = false;
62:    if (this.ctx.test.watch) {
63:      this.watch();
67:  async watch(): Promise<void> {
77:    watch(
79:      this.ctx.watchIgnore,
```

No `setTimeout`, no timeout of any kind. The only exit is:

```
$ gh api .../src/core/tester/index.ts -H "Accept: application/vnd.github.raw" | sed -n '135,147p'
    this.zotero.zotero?.on("close", () => this.onZoteroExit());
  }

  private onZoteroExit = () => {
    this.reporter.stop();
    this.ctx.hooks.callHook("test:exit", this.ctx);

    if (this.reporter.failed)
      process.exit(1);
    else
      process.exit(0);
  };
```

## The results are known before the exit is attempted

The reporter receives `end` and prints the completion line:

```
$ gh api .../src/core/tester/http-reporter.ts -H "Accept: application/vnd.github.raw" \
    | grep -n "end\|completed"
166:      case "end":
172:        logger.success(`Test run completed - ${this.passed} passed`);
174:        logger.fail(`Test run completed - ${this.passed} passed, ${this.failed} failed`);
```

And only then does the in-Zotero side ask Zotero to quit:

```
$ gh api .../src/core/tester/test-bundler-template/raw/mocha-setup.js \
    -H "Accept: application/vnd.github.raw" | sed -n '114,133p'
  runner.on("end", async function () {
    ...
    await send({
      type: "end",
      data: { passed: passed, failed: failed, aborted: aborted, str, indents },
    });

    // Must exit on Zotero side, otherwise the exit code will not be 0 and CI will fail
    if (__EXIT_ON_FINISH__) {
      Zotero.Utilities.Internal.quit(0);
    }
  });
```

`__EXIT_ON_FINISH__` comes from `test-bundler.ts:136`:
`exitOnFinish: !this.ctx.test.watch`.

So the sequence is: results arrive on the Node side, get printed, and then the
process waits on a quit it has no fallback for.

## Forcing the hang, if you want to see it

Not run here. To trigger it deliberately, make the plugin's `shutdown()` block
(an infinite loop, or an unresolved promise awaited during shutdown), then run
with `--no-watch`. Expected: the completion line prints, and the CLI never
returns. Stopping it needs Ctrl-C or an external kill.

## Observed symptom in this project

Zotero's GUI intermittently failed to exit after a completed run, leaving a
finished test run with no process exit. That is what motivated
`scripts/run-tests.mjs`, which greps stdout for the completion line and kills
Zotero itself. The frequency was not measured, and part of the local
non-exit was watch mode rather than this gap, so treat the intermittent GUI stall
as reported rather than characterised.
