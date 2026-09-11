**Title:** `killZotero()` kills Zotero processes the scaffold did not start, and the macOS branch kills only the first match

### Summary

`ZoteroRunner.exit()` (`src/utils/zotero-runner.ts:344-350`) kills the spawned
child and then calls `killZotero()`, which kills by process name across the
whole machine. That reaches the developer's own Zotero window, a second
worktree's dev instance, or a concurrent test run, none of which the scaffold
started. Separately, the macOS command is malformed and kills only the first
match before erroring.

### Defect 1: unscoped name-based kill

```ts
public exit(): void {
  this.zotero?.kill();
  // Sometimes `process.kill()` cannot kill the Zotero,
  // so we force kill it.
  killZotero();
}
```

Linux runs `pkill -9 zotero`. `pkill` matches unanchored against the process
name, so the match is broader than Zotero itself:

```
$ cp /bin/sleep /tmp/zotero-bin
$ cp /bin/sleep /tmp/my-zotero-notes
$ /tmp/zotero-bin 30 & /tmp/my-zotero-notes 30 &
$ pgrep -l zotero          # same matcher pkill uses
3941654 zotero-bin
3941655 my-zotero-notes
```

Both would be killed. `zotero-bin` is what a real Zotero process is called.

`this.zotero` already holds the spawned process, so the information needed to
kill precisely is available on the line above.

`ZOTERO_PLUGIN_KILL_COMMAND` is a useful escape hatch, but it requires knowing
about it before the destructive default fires.

### Defect 2: the macOS command is malformed

```sh
kill -9 $(ps -x | grep zotero)
```

`ps -x` prints `PID TTY STAT TIME COMMAND` per line, and unquoted command
substitution word-splits all of it:

```
$ printf '%s\n' "kill -9 $(ps -x -o pid,tty,stat,time,comm | grep zotero-bin | head -1)"
kill -9 3944833 ?        SN   00:00:00 zotero-bin
```

`kill` takes `3944833`, kills it, then hits `?`, errors, and stops. So it kills
the first match and abandons the rest, which is the opposite of the intent in
the comment. The `catch` then logs `Kill Zotero failed.` even though a process
was killed. The pipeline also matches its own `grep`, and macOS `ps -x` includes
a header row whose first field is the literal `PID`.

### Impact

Our project's contributing docs now tell developers not to run the test suite
while a dev Zotero is open, because cleanup from one takes down the other. That
instruction exists purely to work around this default.

### Suggested fix

Spawn with `detached: true` and kill the process group:

```ts
this.zotero = spawn(binary, args, { env, detached: true });
// ...
process.kill(-this.zotero.pid, "SIGKILL");
```

That addresses the stated reason for the fallback, surviving child processes,
without touching unrelated Zotero instances. Keep
`ZOTERO_PLUGIN_KILL_COMMAND`. Fix or drop the macOS branch. If a name-based
fallback is still wanted for the case where the pid is gone, scope it to the
profile path the scaffold created, which is unique per project.

Note for implementers: switching Linux to `pkill -9 -f zotero-bin` makes it
worse, since `-f` matches full command lines and picks up wrapper shells:

```
$ pgrep -lf "zotero-bin"
3941652 zsh
3941654 zotero-bin
```

### Environment

`zotero-plugin-scaffold` 0.8.8 and `HEAD` as of 2026-08-17, Linux. macOS branch
argued from shell semantics, not run.
