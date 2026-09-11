# Agent prompt: fix parseRepoUrl in zotero-plugin-scaffold

You are fixing a bug in `zotero-plugin-dev/zotero-plugin-scaffold`. Read
`analysis.md` and `reproduction.md` in this directory first; they contain the
exact failing inputs and the observed output.

## Task

`parseRepoUrl` in `src/utils/string.ts` parses `package.json#repository.url`
with a regex that rejects valid URL forms, mis-parses nested paths without
erroring, and throws an error naming neither the field nor the expected format.
Fix all three.

## Steps

1. Read `src/utils/string.ts` (the `parseRepoUrl` function) and every caller.
   Start from `src/config.ts:41` and grep for `parseRepoUrl` across `src/`.
   Note what `owner` and `repo` are used for: the `updateURL` and
   `xpiDownloadLink` defaults and the release target.
2. Check whether the repo already has a test file for `src/utils/string.ts`
   (there are sibling `*.test.ts` files under `src/`, vitest is configured in
   `vitest.config.ts`). Add cases to the existing file if there is one.
3. Write the failing tests first, one per row of the table in
   `reproduction.md`. Include the GitLab subgroup case, which currently returns
   `repo=subgroup/repo` and must not.
4. Implement the parse. Prefer `hosted-git-info`: it is small, widely used, and
   handles SSH, scp-like, `git+https`, shorthand and optional `.git`. Check
   whether it is already in the dependency tree before adding it. If the
   maintainers would object to a new dependency, write a regex that handles the
   same forms and anchor the repo segment so it cannot contain a slash.
5. Make the error actionable. It must state the field
   (`package.json#repository.url`), the value that was found, and an example of
   an accepted form. Keep it a thrown `Error`; do not downgrade to a warning,
   since `owner`/`repo` have no safe default.
6. Consider the host. `hosted-git-info` exposes it, so the hardcoded
   `https://github.com/...` in the `updateURL` and `xpiDownloadLink` defaults
   (`src/config.ts:95-96`) can branch instead of silently pointing GitLab-hosted
   plugins at GitHub. If that turns out to widen the change too far, leave it
   and open a separate issue rather than fixing it halfway.

## Constraints

- Do not change the shape of the return value; callers destructure
  `{ owner, repo }`.
- Keep `build`, `serve` and `test` working for a plugin with no remote at all,
  which is the local-development case. If a URL is absent entirely, the error
  should say so distinctly from the malformed case.
- Match the surrounding code style: this repo uses its own eslint config, so run
  the lint script before finishing.

## Definition of done

- `npx vitest run` passes, including the new cases.
- Every row in `reproduction.md`'s table behaves as the fix intends, with the
  four `ok` rows still parsing to the same `owner`/`repo` as before.
- The error text for both the missing and the malformed case names the field and
  shows an accepted form.
- Nothing else in `src/` changed beyond what the fix requires.
