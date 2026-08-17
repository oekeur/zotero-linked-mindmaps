**Title:** `no-remote` is passed without a dash prefix, so the flag never applies

### Summary

`startZoteroInstance` builds its launch args as
(`src/utils/zotero-runner.ts:161`):

```ts
let args: string[] = ["--purgecaches", "no-remote"];
```

`--purgecaches` is dashed; `no-remote` is not. Gecko only treats an argv entry as
a flag if it starts with `-` (or `/` on Windows), so `--no-remote` is never
applied and the bare token stays in argv as a positional argument.

From `toolkit/xre/CmdLineAndEnvUtils.h:118-138`:

```cpp
// Given a command-line argument, return Nothing if it isn't structurally a
// command-line option, and Some(<the option text>) if it is.
template <typename CharT>
mozilla::Maybe<const CharT*> ReadAsOption(const CharT* str) {
  if (*str == '-') { ... return Some(str); }
#ifdef XP_WIN
  if (*str == '/') { return Some(str + 1); }
#endif
  return Nothing();
}
```

`CheckArg` only compares entries `ReadAsOption` accepted, so a bare `no-remote`
never reaches the string match. `nsAppRunner.cpp` documents the same rule: "Flags
may be in the form -arg or --arg (or /arg on win32)."

### Why it matters

`--no-remote` stops a new launch from handing off to an already-running instance
and exiting. Without it, launching while another Zotero is alive can silently
reuse the existing instance, so the intended profile, arguments and freshly built
plugin never load, while the launch looks successful.

Our project's contributing notes carry this workaround, written from observed
behavior:

> If a prior session crashed or a manifest edit was mid-flight, run
> `pkill -9 -f zotero-bin` before `npm start`. A stale process can linger and
> `npm start` will silently reuse it instead of picking up the fix.

That is the failure mode `--no-remote` prevents. We have not isolated the cause,
so treat the connection as a hypothesis, but it is a plausible one.

### Fix

```diff
-    let args: string[] = ["--purgecaches", "no-remote"];
+    let args: string[] = ["--purgecaches", "--no-remote"];
```

Worth verifying the consequence before merging: with the flag actually applied, a
second concurrent launch will refuse to start rather than folding into the first
instance. That is the right behavior for a tool spawning its own profile, and it
does change the failure mode for anyone currently running two instances.

### Environment

`zotero-plugin-scaffold` 0.8.8 and `HEAD` as of 2026-08-17. Gecko parser behavior
read from `mozilla/gecko-dev` at `HEAD`.
