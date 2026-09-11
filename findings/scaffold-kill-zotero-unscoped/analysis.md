# killZotero kills every Zotero on the machine, and the macOS branch is broken

**Repo:** `zotero-plugin-dev/zotero-plugin-scaffold`
**Location:** `src/utils/zotero-runner.ts:344-381`
**Evidence:** source-confirmed at HEAD; pattern-matching behavior reproduced with decoy processes
**Severity:** takes down the developer's own Zotero session, including one holding an unsaved library

## What the code does

```ts
public exit(): void {
  this.zotero?.kill();
  // Sometimes `process.kill()` cannot kill the Zotero,
  // so we force kill it.
  killZotero();
}

export function killZotero(): void {
  function kill() {
    try {
      if (process.env.ZOTERO_PLUGIN_KILL_COMMAND) {
        execSync(process.env.ZOTERO_PLUGIN_KILL_COMMAND);
      }
      else if (isWindows) {
        execSync("taskkill /f /im zotero.exe");
      }
      else if (isMacOS) {
        execSync("kill -9 $(ps -x | grep zotero)");
      }
      else if (isLinux) {
        execSync("pkill -9 zotero");
      }
      ...
```

## Defect 1: the fallback is unscoped

`exit()` already has the spawned child in `this.zotero` and kills it on the line
above. The fallback then kills by name, machine-wide, so it reaches Zotero
processes the scaffold never started: the developer's own library window, a
second worktree's dev instance, a concurrent test run.

`pkill -9 zotero` matches unanchored against the process name, so the blast
radius is wider than "Zotero". Any process whose name contains the substring is
killed. See `reproduction.md` for the demonstration.

The consequence is not hypothetical for this project. Its CLAUDE.md now warns
against running `npm run test:fast` while a dev Zotero is live, and the reason is
this function: one worktree's cleanup kills the other worktree's Zotero. That is
a workaround written into project documentation to route around a library
default.

`ZOTERO_PLUGIN_KILL_COMMAND` exists as an override, which is good, but it puts
the burden on every user to discover an env var before a destructive default
fires.

## Defect 2: the macOS branch does not do what it says

```sh
kill -9 $(ps -x | grep zotero)
```

`ps -x` prints a full line per process: `PID TTY STAT TIME COMMAND`. Unquoted
command substitution splits every field into a separate argument, so `kill`
receives something like:

```
kill -9 12345 ?? S 0:12.34 /Applications/Zotero.app/Contents/MacOS/zotero -profile ...
```

`kill` processes arguments left to right. The first is a real PID, so one
process dies. The next is `??`, which is not a number, so `kill` errors and
stops. The result is that it kills the first match and abandons the rest, which
is the opposite of the "force kill" the comment claims. The `execSync` throw is
then swallowed by the surrounding `catch`, which logs `Kill Zotero failed.`
even though something was killed.

The pipeline also matches the `grep` process itself, and on macOS `ps -x`
includes a header row whose first field is the literal `PID`.

The correct form is `pkill -f` with a specific pattern, or
`ps -x -o pid=,command= | awk '/zotero/ {print $1}'`, but see defect 1: the
right fix is to not kill by name at all.

## Suggested fix

Spawn Zotero with `detached: true` and kill the process group:

```ts
this.zotero = spawn(binary, args, { env, detached: true });
...
process.kill(-this.zotero.pid, "SIGKILL");
```

That covers the stated motivation for the fallback ("sometimes `process.kill()`
cannot kill the Zotero"), which is usually about child processes surviving the
parent, without touching processes the scaffold did not start. Keep
`ZOTERO_PLUGIN_KILL_COMMAND` as an escape hatch. Fix or delete the macOS branch;
if a name-based fallback is kept for the case where the pid is already gone,
scope it to the profile path the scaffold created, which is unique per project.

## Note for whoever fixes it

Do not simply switch Linux to `pkill -9 -f zotero-bin`. Adding `-f` matches the
full command line, which widens the match to wrapper shells and to any command
mentioning the pattern, including the tool's own invocation. `reproduction.md`
shows that too.
