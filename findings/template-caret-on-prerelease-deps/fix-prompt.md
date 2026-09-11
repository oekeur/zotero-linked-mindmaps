# Agent prompt: pin prerelease dependencies in the template

You are making a small dependency change to `windingwind/zotero-plugin-template`.
Read `analysis.md` and `reproduction.md` in this directory first, including the
section explaining why this is narrower than it first appears.

## Task

`zotero-plugin-toolkit` and `zotero-types` are declared with caret ranges on
prerelease versions, which admits arbitrary later betas plus all later minors.
Pin them.

## Steps

1. Before changing anything, verify the premise still holds. Check the current
   published versions of both packages and whether the template's declared ranges
   still admit them. If the packages have since left prerelease and the template
   has moved to stable ranges, this finding is obsolete; say so and stop.
2. Establish whether the drift actually breaks the template today, since that
   determines how the change should be argued. Install the template with the
   lockfile deleted so the carets resolve fresh, then run its build and
   `tsc --noEmit`. Report what happens. If it type-checks cleanly, the change is
   preventative rather than a bug fix, and the PR should say that plainly rather
   than implying breakage.
3. Pin both to the versions in the template's own `package-lock.json`, which are
   the versions the example code was written against. Read the lockfile; do not
   guess.
4. Check whether the repo has Renovate or Dependabot configured (`.github/`,
   `renovate.json`). If it does, confirm the pinned form is still bumped
   automatically; some configurations only update ranges. If pinning would stop
   updates arriving, adjust the bot config in the same PR or the change makes
   things worse.
5. Consider `zotero-plugin-scaffold: ^0.8.2` in the same PR. Under semver a `0.x`
   minor may break, so the caret allows `0.9.0`. Mention it whether or not you
   change it.
6. Regenerate the lockfile and confirm nothing else moved. `git diff` on
   `package-lock.json` should show only what the pin required.

## Constraints

- Do not upgrade anything as part of this change. Pin to the versions already in
  the lockfile. An upgrade is a separate PR with its own testing.
- Do not touch the example code. If the newer versions break it, that is evidence
  for the pin, not work to absorb here.
- Keep the diff to `package.json` and `package-lock.json`.

## Definition of done

- Both packages pinned exactly, matching the lockfile's existing resolutions.
- `npm ci` from a clean tree, then the template's build and `tsc --noEmit`, all
  pass.
- Automated dependency updates still function, verified against the repo's bot
  config.
- The PR states whether current drift breaks the template, based on step 2 rather
  than on assertion.
