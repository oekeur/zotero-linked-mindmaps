# `no-remote` is passed without a dash, so the flag never takes effect

**Repo:** `zotero-plugin-dev/zotero-plugin-scaffold`
**Location:** `src/utils/zotero-runner.ts:161`
**Evidence:** scaffold source confirmed; Gecko's argument parser confirmed from its own source
**Severity:** the flag silently does nothing, which plausibly explains stale-instance reuse

## The line

```ts
private async startZoteroInstance() {
  // Build args
  let args: string[] = ["--purgecaches", "no-remote"];
```

`--purgecaches` has its dashes. `no-remote` does not.

## Why that matters, not just cosmetically

Gecko decides whether an argv entry is a flag in `ReadAsOption`
(`toolkit/xre/CmdLineAndEnvUtils.h:118-138`):

```cpp
template <typename CharT>
mozilla::Maybe<const CharT*> ReadAsOption(const CharT* str) {
  if (!str) {
    return Nothing();
  }
  if (*str == '-') {
    str++;
    if (*str == '-') {
      str++;
    }
    return Some(str);
  }
#ifdef XP_WIN
  if (*str == '/') {
    return Some(str + 1);
  }
#endif
  return Nothing();
}
```

`CheckArg` then only compares entries for which `ReadAsOption` returned a value:

```cpp
while (*curarg) {
  if (const auto arg = ReadAsOption(*curarg)) {
    if (strimatch(aArg, arg.value())) {
```

A bare `no-remote` returns `Nothing()`, so it is skipped and never matched.
`CheckArg("no-remote")` reports not-found, and the token stays in argv as a
positional argument for whatever consumes leftovers.

The doc comment above `CheckArg` states the same contract: "Flags may be in the
form -arg or --arg (or /arg on win32)."

## What `--no-remote` is for

It stops a new launch from handing off to an already-running instance and exiting.
Without it, starting the binary while another instance is alive can result in the
existing instance being reused, so the new profile, new arguments and freshly
built plugin never take effect. The launch appears to succeed.

## The symptom this may explain

This project has a documented workaround that matches that description. From its
CLAUDE.md verification protocol:

> If a prior session crashed or a manifest edit was mid-flight, run
> `pkill -9 -f zotero-bin` before `npm start`. A stale process can linger and
> `npm start` will silently reuse it instead of picking up the fix.

"Silently reuse an existing instance instead of starting a new one" is precisely
what `--no-remote` prevents. The connection is a hypothesis, not a demonstrated
causal chain, but it is a strong enough one to be worth testing before dismissing
this as a cosmetic slip.

It also interacts badly with the unscoped kill in
`scaffold-kill-zotero-unscoped`: a workflow already prone to leftover processes
gets a cleanup step that over-reaches, and a launch flag that does not prevent
reuse.

## Fix

```diff
-    let args: string[] = ["--purgecaches", "no-remote"];
+    let args: string[] = ["--purgecaches", "--no-remote"];
```

One character short of trivial. Before merging it, check that no code downstream
relies on the current behavior: adding `--no-remote` means a second launch now
fails to start rather than folding into the existing instance, which changes the
failure mode for anyone running two instances concurrently. That is the correct
behavior for a dev tool spawning its own profile, and it should still be verified
rather than assumed.

## Not verified

Whether Zotero's own command line handler does anything with the leftover
positional `no-remote` token. Firefox treats unrecognised positional arguments as
URLs to open; Zotero may ignore it. Worth a look while fixing, though the flag not
applying is the substance either way.
