# Reproduction

## Source, at upstream HEAD

```
$ gh api repos/zotero-plugin-dev/zotero-plugin-scaffold/contents/src/utils/zotero-runner.ts \
    -H "Accept: application/vnd.github.raw" | grep -n "pkill\|ps -x\|taskkill\|kill"
346:    this.zotero?.kill();
347:    // Sometimes `process.kill()` cannot kill the Zotero,
348:    // so we force kill it.
349:    killZotero();
353: export function killZotero(): void {
360:        execSync("taskkill /f /im zotero.exe");
363:        execSync("kill -9 $(ps -x | grep zotero)");
366:        execSync("pkill -9 zotero");
```

Identical in the installed 0.8.8 bundle at
`node_modules/zotero-plugin-scaffold/dist/shared/scaffold-src-bWcaMVyt.mjs:3761-3775`.

## Blast radius of `pkill -9 zotero`

`pgrep` and `pkill` share the same matcher, so `pgrep` shows what `pkill` would
kill without killing anything. Two decoy processes were created by copying
`/bin/sleep` under names that a real machine plausibly has: `zotero-bin`, which
is what Zotero's own process is called, and `my-zotero-notes`, standing in for
any unrelated program with the substring in its name.

```
$ cp /bin/sleep /tmp/zotero-bin
$ cp /bin/sleep /tmp/my-zotero-notes
$ /tmp/zotero-bin 30 &
$ /tmp/my-zotero-notes 30 &

$ pgrep -l zotero
3941654 zotero-bin
3941655 my-zotero-notes
```

Both match. `pkill -9 zotero` would kill both. Applied to a real machine, that
is the developer's own Zotero window, any second worktree's dev instance, and
any concurrent test run, none of which the scaffold started.

The match is unanchored substring matching against the process name, not an
exact comparison, which is why `my-zotero-notes` is included.

### And why `-f` is not the fix

```
$ pgrep -lf "zotero-bin"
3941652 zsh
3941654 zotero-bin
```

`-f` matches the whole command line, so the shell that launched the decoy
matches too. Anyone tempted to "scope" the pattern by adding `-f` widens it
instead.

Decoys cleaned up afterwards with an explicit `kill <pid>`, and `pgrep -l zotero`
then returns nothing.

## The macOS branch

Not run here, no macOS available, so this is argued from the shell semantics
rather than observed.

`ps -x` prints one line per process, fields `PID TTY STAT TIME COMMAND`.
Unquoted command substitution word-splits all of it, so

```sh
kill -9 $(ps -x | grep zotero)
```

expands to roughly

```sh
kill -9 12345 ?? S 0:12.34 /Applications/Zotero.app/Contents/MacOS/zotero -profile /Users/x/...
```

`kill` handles arguments in order: `12345` is a valid PID and that process dies,
then `??` is not a number, so `kill` exits with an error and never reaches any
further PID. So it kills the first match only, then throws. The surrounding
`catch` swallows the throw and logs `Kill Zotero failed.` even though a process
was killed, which makes the log actively misleading.

Two more wrinkles: the pipeline matches the `grep` process itself, and macOS
`ps -x` emits a header line whose first field is the literal string `PID`.

The expansion can be seen without killing anything. Run against the same
`zotero-bin` decoy, printing the command instead of executing it:

```
$ /tmp/zotero-bin 20 &
$ printf '%s\n' "kill -9 $(ps -x -o pid,tty,stat,time,comm | grep zotero-bin | head -1)"
kill -9 3944833 ?        SN   00:00:00 zotero-bin
```

`kill` gets `3944833`, kills it, then hits `?` and stops. The columns were
constrained with `-o` only to keep the line readable; bare `ps -x` as the
scaffold uses it prints the same PID-first layout followed by the full command,
so there is more garbage after the PID, not less.

## Observed consequence in this project

This repo's CLAUDE.md carries the instruction not to run `npm run test:fast`
while a dev Zotero from `npm start` is live, because the kill takes the dev
instance down with it. That warning exists to work around this function's
default.
