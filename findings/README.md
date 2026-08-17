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

Findings were first noticed against the installed versions, then re-verified
against each project's `HEAD` on 2026-08-17 so none of them are already fixed:

- `zotero-plugin-scaffold` 0.8.8 installed, `zotero-plugin-dev/zotero-plugin-scaffold@HEAD`
- `zotero-plugin-toolkit` 5.1.0-beta.13 installed, `windingwind/zotero-plugin-toolkit@HEAD`
- `zotero-types` 4.1.0-beta.4 installed, `windingwind/zotero-types@HEAD`
- `windingwind/zotero-plugin-template@HEAD`
- `zotero/zotero@HEAD` for the two Zotero-core references

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
