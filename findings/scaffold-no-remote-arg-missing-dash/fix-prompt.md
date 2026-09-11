# Agent prompt: fix the dashless `no-remote` launch argument

You are fixing a one-character bug with a real behavioral consequence in
`zotero-plugin-dev/zotero-plugin-scaffold`. Read `analysis.md` and
`reproduction.md` in this directory first. The edit is trivial; the verification
is the actual work.

## Task

`src/utils/zotero-runner.ts:161` passes `"no-remote"` without a dash prefix, so
Gecko never treats it as a flag and `--no-remote` is not applied. Fix the
argument and establish what changes as a result.

## Steps

1. Read `startZoteroInstance` in `src/utils/zotero-runner.ts` and note the whole
   arg list. Check the other entries for the same class of mistake while you are
   there: some use `--`, some a single `-`, and Gecko accepts both, so only a
   missing prefix is a bug.
2. Confirm the premise independently rather than trusting this write-up. Read
   `ReadAsOption` and `CheckArg` in Gecko's `toolkit/xre/CmdLineAndEnvUtils.h` and
   verify that an argv entry with no dash is skipped before the name comparison.
3. Make the change: `"no-remote"` becomes `"--no-remote"`.
4. Establish the behavioral difference, because this changes what happens when two
   instances are launched. Run the scaffold's serve command against a fresh profile,
   leave it running, and launch a second one from a different working directory
   with its own profile. Record the behavior before and after the fix. Expected
   after the fix: the second launch refuses to start rather than handing off.
5. Test the interaction with the tester, which empties and recreates its profile
   directories on start. Confirm a test run still works when a serve instance is
   already alive, or document that it now fails cleanly instead of silently
   attaching to the wrong instance. Either outcome is an improvement over silence,
   but the docs should say which one it is.
6. Check whether the leftover positional token was doing anything. Look at how
   Zotero's command line handler treats unrecognised positional arguments
   (`chrome/content/zotero/xpcom/commandLineHandler.js`,
   `chrome/content/zotero/modules/commandLineOptions.mjs`). Report what you find;
   if it was being interpreted as a URL or file to open, that is worth noting in
   the PR.
7. Search the repo's docs and issues for reports of a stale instance being reused
   or a rebuilt plugin not taking effect. If any exist, link them: this fix may
   close them, and that is the strongest argument for the change.

## Constraints

- One-line source change. Do not restructure the arg building.
- Do not add a config option to disable the flag unless step 5 turns up a case that
  genuinely needs it.
- If the behavioral test shows the fix breaks a workflow the project supports,
  stop and report rather than working around it. The correct outcome might be a
  docs change alongside the fix.

## Definition of done

- `--no-remote` is passed with its dashes.
- The two-instance behavior is documented from an actual run, before and after.
- A serve run and a test run both still work in the single-instance case.
- The PR states what the leftover positional token was doing, based on step 6.
