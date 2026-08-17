# Agent prompt: make initLocale load every shipped .ftl file

You are fixing a bug in `windingwind/zotero-plugin-template`. Read
`analysis.md` and `reproduction.md` in this directory first. A working fix
already exists in this repo at `src/utils/locale.ts` plus
`test/mindmap/locale.test.ts`; read both before writing anything, and treat them
as a reference rather than something to copy wholesale, since the upstream fix
should be less manual.

## Task

`initLocale` in `src/utils/locale.ts` builds the `Localization` bundle from
`addon.ftl` only, while the template ships `addon.ftl`, `mainWindow.ftl` and
`preferences.ftl`. Keys from the other two resolve to their own raw ids through
`getString`, silently. Make `getString` see every shipped locale file.

## Steps

1. Read `src/utils/locale.ts` in full, including `_getString`, so you understand
   the fallback that produces the symptom (`return localStringWithPrefix`).
2. Find how the scaffold generates `typings/i10n.d.ts`. It enumerates
   `addon/locale/**/*.ftl` at build time, which means the file list already
   exists somewhere in the pipeline. Determine whether the template can consume
   that list rather than restating it. Check
   `node_modules/zotero-plugin-scaffold/dist` and the scaffold's `fluent`
   builder. Report what you find before choosing an approach.
3. Pick the approach. In order of preference:

   **Consume a build-generated list**, so adding a `.ftl` file needs no code
   edit. This may require a change in `zotero-plugin-scaffold` as well; if so,
   say so explicitly and scope the template-side change to consuming it.

   **Enumerate at runtime** from the add-on root with `IOUtils.getChildren`,
   filtering to `.ftl`. Costs one async call at startup, so `initLocale` becomes
   async and its caller in `hooks.ts` has to await it. Check every caller before
   changing the signature.

   **An explicit exported list**, as in this repo. Simplest, but it can go
   stale, so it needs the test from step 4 to be worth anything.

4. Add a test that fails on the symptom, not on the bookkeeping. The useful
   assertion is: for every message id in every shipped `.ftl`, `getString`
   returns something other than the id itself. Note the wrinkle documented in
   `test/mindmap/locale.test.ts`: messages that carry only `.label` or
   `.tooltiptext` and no value of their own resolve to the raw id unless
   `getString` is given the branch, so the test must parse attributes and pass
   the branch or it will report false positives.
5. Verify against a live Zotero, following the template's own test setup
   (`zotero-plugin test`). This cannot be checked by type-checking alone: the
   generated `FluentMessageId` union accepts keys that `getString` cannot
   resolve, which is exactly why the bug survived.

## Constraints

- Do not move keys between `.ftl` files to dodge the problem. The template
  ships three files deliberately and the fix must support that.
- Keep `getString`'s signature and overloads unchanged. Plugin code built on the
  template calls it directly.
- If you change `initLocale` to async, update every caller and confirm nothing
  calls `getString` before it resolves, or the fix trades a silent wrong string
  for a silent missing bundle.

## Definition of done

- A key defined in `mainWindow.ftl` and one in `preferences.ftl` both resolve
  through `getString` in a running Zotero.
- The new test fails when a shipped `.ftl` is not reachable, verified by
  temporarily reverting `initLocale` to the single-file form.
- `npm run build` and the template's lint script both pass.
