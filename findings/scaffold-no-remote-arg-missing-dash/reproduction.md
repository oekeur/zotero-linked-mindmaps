# Reproduction

## The scaffold side

At upstream HEAD:

```
$ gh api repos/zotero-plugin-dev/zotero-plugin-scaffold/contents/src/utils/zotero-runner.ts \
    -H "Accept: application/vnd.github.raw" | sed -n '159,180p'
  private async startZoteroInstance() {
    // Build args
    let args: string[] = ["--purgecaches", "no-remote"];
    if (this.options.profile.path) {
      args.push("-profile", resolve(this.options.profile.path));
    }
    ...
```

Same in the installed 0.8.8 bundle:

```
$ grep -n "purgecaches" node_modules/zotero-plugin-scaffold/dist/shared/scaffold-src-bWcaMVyt.mjs
3621:		let args = ["--purgecaches", "no-remote"];
```

`--purgecaches` is dashed, `no-remote` is not.

## The Gecko side: a bare token is not a flag

`toolkit/xre/CmdLineAndEnvUtils.h:118-138`, from mozilla-central via the
`mozilla/gecko-dev` mirror:

```cpp
// Given a command-line argument, return Nothing if it isn't structurally a
// command-line option, and Some(<the option text>) if it is.
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

And the matcher only considers entries that `ReadAsOption` accepted
(`CmdLineAndEnvUtils.h:167-178`):

```cpp
  CharT** curarg = aArgv + 1;  // skip argv[0]
  ArgResult ar = ARG_NONE;

  while (*curarg) {
    if (const auto arg = ReadAsOption(*curarg)) {
      if (strimatch(aArg, arg.value())) {
```

So `no-remote` with no leading dash never reaches `strimatch`, and
`CheckArg("no-remote")` returns not-found. The flag is inert.

`nsAppRunner.cpp:533-539` documents the same contract:

```cpp
/**
 * Check for a commandline flag. Ignore data that's passed in with the flag.
 * Flags may be in the form -arg or --arg (or /arg on win32).
 ...
```

## Behavioural check, not run here

To confirm the practical effect:

1. Launch Zotero with the scaffold's exact arg list against a fresh profile.
2. Leave it running.
3. Launch again with a different profile and the same arg list.

With `--no-remote` correctly applied, the second launch refuses to start and says
another instance is running. With the current bare `no-remote`, expect the second
launch to hand off to the first instance and exit, so the second profile and its
freshly built plugin never load.

That was not run for this write-up. The static evidence above establishes that the
flag does not apply; the behavioural test establishes what that costs.

## The symptom that motivated looking

This project's CLAUDE.md verification protocol contains:

> If a prior session crashed or a manifest edit was mid-flight, run
> `pkill -9 -f zotero-bin` before `npm start`. A stale process can linger and
> `npm start` will silently reuse it instead of picking up the fix.

Silent reuse of an existing instance is the exact failure `--no-remote` exists to
prevent. Treat this as a hypothesis worth testing, not a proven cause: the note
was written from observed behavior without isolating why, and other explanations
(profile locking, the debugger port) are possible.
