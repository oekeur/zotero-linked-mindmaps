# Agent prompt: scope Zotero process termination to the spawned instance

You are fixing a destructive default in
`zotero-plugin-dev/zotero-plugin-scaffold`. Read `analysis.md` and
`reproduction.md` in this directory first.

## Task

`killZotero()` in `src/utils/zotero-runner.ts` kills Zotero by process name
across the whole machine, so it destroys instances the scaffold never started.
The macOS branch is additionally malformed and kills only the first match before
erroring. Make termination target the spawned process and nothing else.

## Steps

1. Read `src/utils/zotero-runner.ts` end to end, in particular
   `startZoteroInstance()` (the `spawn` call), `exit()`, and `killZotero()`.
   Note that `exit()` already has the child handle in `this.zotero`.
2. Find every caller of `killZotero`, including anything that imports it
   outside this file. Grep across `src/`. `src/core/tester/index.ts` and
   `src/core/server.ts` both drive the runner's lifecycle, so check how each
   reaches termination, including the SIGINT path.
3. Work out why the name-based fallback was added. The comment says
   `process.kill()` sometimes fails. Before replacing it, form a concrete theory:
   the usual cause is Zotero forking children that outlive the parent, or the
   parent being a launcher script. Say which one you conclude and on what
   evidence, because the fix depends on it.
4. Implement process-group termination: `spawn(..., { detached: true })` plus
   `process.kill(-pid, "SIGKILL")`. Handle the case where the group is already
   gone (`ESRCH`) without logging a failure. Confirm the `detached` change does
   not break the RDP connection or stdio wiring set up right after `spawn`.
5. Decide what remains of `killZotero()`. Options, in preference order: delete
   it; or keep it as an opt-in last resort scoped to the scaffold's own profile
   path, which is unique per project and appears in the process command line via
   `-profile`. Preserve `ZOTERO_PLUGIN_KILL_COMMAND` either way, since users
   depend on it.
6. Fix or delete the macOS branch. If any name-based path survives, it must not
   word-split `ps` output into `kill`. Use `pkill -f` with a profile-path
   pattern, or `ps -x -o pid=,command= | awk`. Read `reproduction.md`'s note on
   why bare `-f` with a generic pattern is worse than what is there now.
7. Check the CI paths. `isCI` forces headless mode, and the tester empties the
   profile dirs on start. Confirm the new termination still leaves CI able to
   exit with the right code, since that is what the current force-kill props up.

## Constraints

- Never widen the match. If you cannot scope precisely, prefer leaving a process
  alive over killing an unknown one; an orphan is recoverable and a killed
  library session is not.
- Do not change the public behavior of `exit()` for callers.
- Keep `ZOTERO_PLUGIN_KILL_COMMAND` working and documented.

## Verification

Terminating by name cannot be tested safely with a real Zotero, so use decoys.
`reproduction.md` shows the technique: copy `/bin/sleep` to a temp path named
`zotero-bin`, run it, and assert the scaffold's termination path leaves it
alive while killing the process it actually spawned. Add that as a vitest case
if the repo's test setup allows spawning; if not, at least verify manually and
state that in the PR.

## Definition of done

- A `zotero-bin`-named decoy process survives a full serve or test run and its
  cleanup.
- The process the scaffold spawned, and any children it forked, are gone after
  `exit()`.
- `ZOTERO_PLUGIN_KILL_COMMAND` still overrides.
- No branch passes `ps` output through word splitting into `kill`.
- CI still exits with the correct code on both passing and failing suites.
