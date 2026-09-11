# Upstream findings

Friction hit while building Zotero Linked Mindmaps, traced back to the tooling
this plugin is built on. Each finding is a directory with four files:

| File              | Contents                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| `analysis.md`     | What the code does, where, why it is wrong, and how confident the claim is |
| `reproduction.md` | Steps plus the actual observed output                                      |
| `issue.md`        | Issue body ready to paste upstream                                         |
| `fix-prompt.md`   | Task prompt for an agent that will write the fix                           |

## Versions this was checked against

Findings were first noticed against the installed versions and re-verified
against each project's `HEAD` on 2026-08-17. The whole set was re-checked on
2026-09-11 against:

- `zotero-plugin-scaffold` 0.8.8 installed; 0.9.2 on npm (2026-09-08); `zotero-plugin-dev/zotero-plugin-scaffold@54b93b3` (2026-09-08)
- `zotero-plugin-toolkit` 5.1.0-beta.13 installed; 5.2.0 on npm (2026-07-21); `windingwind/zotero-plugin-toolkit@ec6353c` (2026-07-21)
- `zotero-types` 4.1.0-beta.4 installed; 4.1.3 on npm (latest), 4.1.0-beta.8 (beta); `windingwind/zotero-types@6c57b6b` (2026-08-01)
- `windingwind/zotero-plugin-template@306d4e2` (2025-12-16, no commits since the first check)
- `zotero/zotero@main` with `chrome/content/zotero/tabs.js` last changed in 92dfac8 (2026-09-04); Zotero 10.0-beta.25 installed
- `windingwind/doc-for-zotero-plugin-dev@e92475c` (2026-05-05)

### Outcome per finding, 2026-09-11

| Finding                                         | Outcome       | What was checked                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scaffold-parse-repo-url`                       | still present | `src/utils/string.ts:42-54` at 54b93b3 carries the same regex and the same two error strings                                                                                                                                                                                                                                                                                       |
| `scaffold-placeholder-not-substituted`          | still present | `src/core/builder/replace.ts` builds the map from `define` keys and nothing scans the output afterwards                                                                                                                                                                                                                                                                            |
| `scaffold-no-remote-arg-missing-dash`           | still present | `src/utils/zotero-runner.ts:170` still reads `["--purgecaches", "no-remote"]`; same in the 0.9.1 and 0.9.2 bundles                                                                                                                                                                                                                                                                 |
| `scaffold-kill-zotero-unscoped`                 | still present | `killZotero` at `zotero-runner.ts:402-431` unchanged: `pkill -9 zotero` on Linux, `kill -9 $(ps -x \| grep zotero)` on macOS                                                                                                                                                                                                                                                       |
| `scaffold-zotero-stdout-discarded`              | changed       | Fixed for `serve` in 0.9.1 (2026-08-31): `server.debugOutputFile` (default `true`) appends `-ZoteroDebugText` and writes stdout and stderr to `.scaffold/logs/zotero-<time>.log` and `-stderr.log`. The test runner does not pass the option, so a test run's output is still dropped                                                                                              |
| `scaffold-test-exit-no-watchdog`                | still present | `src/core/tester/index.ts:136-146` still exits only from Zotero's `close`; no timer anywhere in `src/core/tester/`                                                                                                                                                                                                                                                                 |
| `template-locale-loads-only-addon-ftl`          | still present | `src/utils/locale.ts` builds the bundle from `addon.ftl` alone; `addon/locale/en-US/` still ships three files                                                                                                                                                                                                                                                                      |
| `template-caret-on-prerelease-deps`             | still present | `^5.1.0-beta.13`, `^4.1.0-beta.4`, `^0.8.2` unchanged; toolkit 5.2.0 and zotero-types 4.1.3 both satisfy the ranges                                                                                                                                                                                                                                                                |
| `toolkit-dialog-virtualized-table-incompatible` | still present | `src/helpers/dialog.ts:289` opens `about:blank`; `src/helpers/virtualizedTable.ts:26-31` calls `win.require` with no guard                                                                                                                                                                                                                                                         |
| `types-zotero-tabs-data-not-optional`           | still present | `types/zoteroTabs.d.ts` still declares `data?: any` (lines 10 and 38)                                                                                                                                                                                                                                                                                                              |
| `zotero-tabs-add-missing-data-validation`       | still present | `tabs.js:636-660` at main validates `title`, `index`, `onClose` and not `data`; `_update()` reads `tab.data.itemID` and `tab.data.icon` unguarded (342, 377, 380). The empty `typeof type` block is still there. New since the first check: line 659 fires a `tab` notifier with `Object.assign({}, data, { type })`, which tolerates `undefined` and so does not change the crash |
| `docs-bootstrap-browser-globals`                | still present | `docs/main/privileged-vs-unprivileged.md:43` is still the one sentence; no page under `docs/main/` mentions `ResizeObserver`, `MutationObserver` or polyfills                                                                                                                                                                                                                      |

The one change affects this repo's own notes: `CLAUDE.md`'s statement that the
scaffold discards Zotero's stdout is true of the installed 0.8.8 and false from
0.9.1 for `npm start`. Upgrading the scaffold is a separate decision (it is a
`0.x` minor bump with a changed launch path), so the note now names the version
rather than being dropped.

## Where this directory lives

Decision, 2026-09-11: `findings/` is brought into `main` on this branch as a
plain copy of `origin/worktree-upstream-findings` at 16156bc, and that branch is
deleted once every finding is filed or retired. Reasons: nothing on `main`
referenced the branch, so the write-ups were invisible without listing remote
branches; the directory is purely additive, sits outside `docs/` so VitePress
never builds it, and is already Prettier-clean; and `main` refuses merge
commits, so a copy is the only linear way in. The branch's single commit is not
preserved as history, which costs nothing since this file records the dates.

## Findings, ranked by value per unit of effort

| #   | Finding                                                                                           | Repo         | Evidence                                          |
| --- | ------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------- |
| 1   | [`scaffold-parse-repo-url`](scaffold-parse-repo-url/)                                             | scaffold     | Reproduced end to end                             |
| 2   | [`scaffold-placeholder-not-substituted`](scaffold-placeholder-not-substituted/)                   | scaffold     | Reproduced end to end                             |
| 3   | [`template-locale-loads-only-addon-ftl`](template-locale-loads-only-addon-ftl/)                   | template     | Reproduced, fix already written here              |
| 4   | [`scaffold-no-remote-arg-missing-dash`](scaffold-no-remote-arg-missing-dash/)                     | scaffold     | Both sides source-confirmed; one character to fix |
| 5   | [`scaffold-kill-zotero-unscoped`](scaffold-kill-zotero-unscoped/)                                 | scaffold     | Source-confirmed, match behavior reproduced       |
| 6   | [`types-zotero-tabs-data-not-optional`](types-zotero-tabs-data-not-optional/)                     | zotero-types | Crash observed, both sides source-confirmed       |
| 7   | [`toolkit-dialog-virtualized-table-incompatible`](toolkit-dialog-virtualized-table-incompatible/) | toolkit      | Observed here, source-confirmed                   |
| 8   | [`scaffold-zotero-stdout-discarded`](scaffold-zotero-stdout-discarded/)                           | scaffold     | Source-confirmed                                  |
| 9   | [`scaffold-test-exit-no-watchdog`](scaffold-test-exit-no-watchdog/)                               | scaffold     | Source-confirmed; earlier diagnosis corrected     |
| 10  | [`zotero-tabs-add-missing-data-validation`](zotero-tabs-add-missing-data-validation/)             | zotero       | Source-confirmed                                  |
| 11  | [`docs-bootstrap-browser-globals`](docs-bootstrap-browser-globals/)                               | docs         | Observed here; needs per-scope verification       |
| 12  | [`template-caret-on-prerelease-deps`](template-caret-on-prerelease-deps/)                         | template     | Reproduced, narrower than first thought           |

Findings 1 and 2 are one PR's worth of work in the same area, build-time
validation of `package.json`-derived values, and are worth sending together.

Findings 4 and 5 both touch process lifecycle and compound each other: a launch
flag that never applies, so stale instances get reused, plus a cleanup step that
kills more than it started.

## Two corrections to record

Findings 9 and 12 were both filed on a wrong first reading, and each analysis
opens by saying so:

- Finding 9 was originally "the test command hangs". It does stay open locally, but
  that is watch mode working as designed. The real gap is narrower: no watchdog on
  the `exitOnFinish` path.
- Finding 12 was originally "a fresh clone drifts to breaking betas". It does not,
  because the template ships a lockfile. The drift only affects paths where the
  lockfile is not inherited.

Both were caught by checking the claim against source rather than against notes.

## What connects most of these

Almost none of them fail where the cause is. Sorted by how the damage reaches you:

- **Silent, no output at all**: the unsubstituted placeholder, the unreachable
  locale file, the inert `--no-remote`, the table that never renders, two of the
  three browser-global failures.
- **Loud but misattributed**: `Zotero_Tabs.add` crashing inside `tabs.js` with no
  plugin frame, and `Parse repository URL failed.` with a stack entirely inside
  `node_modules`.
- **Destructive or hanging rather than erroring**: the machine-wide kill, and a
  finished test run that never exits.

That distribution is why this project's CLAUDE.md carries a manual verification
protocol at all, and why most of the proposed fixes are about moving a failure
earlier and closer to its cause rather than adding features.

## Caveat on duplicates

The upstream trackers were searched only shallowly, a handful of
`gh search issues` queries per repo, and one query returned HTTP 504. Check for
an existing issue before opening any of these.
