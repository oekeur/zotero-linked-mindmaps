# npm scripts reference

Every entry in `package.json` `scripts`, what it runs, what it writes, and when it applies.

## prepare

```
husky
```

Lifecycle script; npm runs it automatically after `npm install`. Installs the git hooks in `.husky/`:

| Hook         | Command                              |
| ------------ | ------------------------------------ |
| `pre-commit` | `npx lint-staged`                    |
| `commit-msg` | `npx --no -- commitlint --edit "$1"` |

`lint-staged` (configured in `package.json`) runs `eslint --fix` on staged `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` files, and `prettier --write` on those plus `.json`, `.md`, `.css`, `.xhtml`.

`commitlint` uses `commitlint.config.mjs`: `@commitlint/config-conventional` with `type-enum` narrowed to `feat`, `fix`, `improve`, `hotfix`, `chore`, `docs`, `test`. A commit with any other type is rejected.

## clean:profile

```
node scripts/clean-dev-profile.mjs
```

Two cleanups against the dev profile named in `.env`:

1. Runs `pkill -9 -f zotero-bin`. Logs `clean-dev-profile: killed stale zotero-bin process` on a match; a `pkill` exit code of 1 (no match) is swallowed.
2. Reads `ZOTERO_PLUGIN_PROFILE_PATH` from `.env`, opens `<profile>/session.json`, and drops every tab whose `type` starts with `zoterolinkedmindmaps-` (the `config.addonRef` value plus a hyphen). If it removed tabs and none of the survivors is marked `selected`, it selects the last remaining tab, then rewrites `session.json`.

If `ZOTERO_PLUGIN_PROFILE_PATH` is absent from `.env`, the script logs `clean-dev-profile: ZOTERO_PLUGIN_PROFILE_PATH not set in .env, skipping session.json cleanup` and skips step 2. It still does step 1. A missing `session.json` is not an error.

Run it directly when you want the cleanup without launching Zotero.

## prestart

```
node scripts/clean-dev-profile.mjs
```

Identical to `clean:profile`. npm runs it automatically before `start`, so `npm start` always begins with no stale process and no stale mindmap tab in the session file.

## start

```
zotero-plugin serve
```

Builds `src/` and `addon/` into `.scaffold/build/`, launches the Zotero binary at `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` against the profile at `ZOTERO_PLUGIN_PROFILE_PATH` with `--purgecaches no-remote`, installs the build as a temporary plugin, and then watches the source directories. An edit under `src/` or `addon/` triggers a rebuild and reload without restarting Zotero.

Devtools are on (`server.devtools` defaults to true) and the profile is created if it does not exist (`server.createProfileIfMissing` defaults to true). Requires `.env`; see [development-setup.md](./development-setup.md).

Do not run two `npm start` instances against the same profile path.

## build

```
zotero-plugin build && tsc --noEmit
```

`zotero-plugin build` writes to `.scaffold/build/`:

- `.scaffold/build/addon/` with `addon/**/*.*` copied across and the `__addonName__`-style tokens in those files substituted from `zotero-plugin.config.ts` `build.define`.
- `.scaffold/build/addon/content/scripts/zoterolinkedmindmaps.js`, the esbuild bundle of `src/index.ts` (bundled, target `firefox115`).
- `.scaffold/build/addon/manifest.json`, merged with generated `applications.zotero.id` and `update_url`.
- A packed `.xpi` and `update.json` / `update-beta.json`.

It also regenerates two typings files in place from the Fluent and prefs sources: `typings/i10n.d.ts` and `typings/prefs.d.ts`. Expect those to show up as working-tree changes after a build.

`tsc --noEmit` then type-checks using the root `tsconfig.json`, which extends `zotero-types/entries/sandbox/` (that preset sets `"strict": true`) and has `include: ["src", "typings"]`.

`test/` is not in that include list. `npm run build` does not type-check the test suite. `test/tsconfig.json` exists and extends the root config, but no script invokes `tsc` against it. After changing an exported signature in `src/`, run the test suite (or point `tsc --noEmit -p test` at it yourself) to find test-side breakage; the build will not.

## lint:check

```
prettier --check . && eslint .
```

Reports formatting deviations and lint errors across the whole repo without writing anything. Exits nonzero on the first of the two that fails, so a Prettier failure hides ESLint output until it is fixed. This is what CI runs in the `lint` job.

Prettier options live in `package.json`: `printWidth` 80, `tabWidth` 2, `endOfLine` `lf`, plus `htmlWhitespaceSensitivity: "css"` for `*.xhtml`.

ESLint uses `eslint.config.mjs`: the `@zotero-plugin/eslint-config` preset with two overrides. `@typescript-eslint/no-unused-vars` is turned off for all `**/*.ts` (a `TODO(TASK-3)` in the config marks this as temporary, left from the template's example code). Files under `scripts/**` get Node globals, since they run under plain `node` rather than in the Zotero sandbox.

## lint:fix

```
prettier --write . && eslint . --fix
```

Same two tools, writing fixes. Reformats every Prettier-eligible file in the repo and applies ESLint autofixes. Anything ESLint cannot fix automatically is still reported and still exits nonzero.

## test

```
zotero-plugin test
```

Builds the plugin, bundles `test/` into a temporary tester plugin, empties and recreates `.scaffold/test/profile`, `.scaffold/test/data`, and `.scaffold/test/resource`, then launches Zotero with both plugins installed and runs the Mocha suite inside it. Results stream back over HTTP to the CLI process on a free port chosen at launch; each `pass`, `fail`, and `pending` prints as it arrives, and the run ends with `Test run completed - N passed` or `Test run completed - N passed, M failed`.

Configured in `zotero-plugin.config.ts` under `test`, which sets only `waitForPlugin: "() => Zotero.ZoteroLinkedMindmaps.data.initialized"`. Scaffold defaults supply the rest: entries `"test"`, Mocha timeout 10000 ms, `startupDelay` 1000 ms, `abortOnFail` false, `headless` false, `watch` true.

Watch is the part that surprises people. Without `--exit-on-finish` or `--no-watch`, `zotero-plugin test` keeps Zotero open after the suite finishes and re-runs on changes to `src/` or `test/`. It is a watch session, not a hang. Under CI (`isCI`), the runner forces `watch` to false and `headless` to true, so the process exits with 0 or 1 on its own.

## test:fast

```
node scripts/run-tests.mjs
```

Spawns `npx zotero-plugin test` with `detached: true`, pipes its stdout through unchanged, and watches for `/Test run completed - (\d+) passed(?:, (\d+) failed)?/`. On a match it logs `run-tests: completion line seen, killing Zotero instead of waiting for its own exit (failed=N)`, SIGKILLs the child's process group, and exits 1 if any test failed, 0 otherwise.

Because it kills a process group rather than matching on process names, it leaves every Zotero it did not start alone, so it is safe to run alongside `npm start` or a test run in another worktree. Detaching also means Ctrl-C no longer reaches Zotero through the terminal, so the script traps `SIGINT` and `SIGTERM` and kills the group itself.

A 240-second timer starts at launch. If no completion line has appeared by then, the script prints `run-tests: no completion line after 240s, treating as a hang` and exits 1. The timer covers the whole suite, not the gap since the last line, because several tests wait on Zotero's own notification timing and cannot be shortened.

If the child exits before the completion line appears, the script exits with the child's code, or 1 if the code is null.

Use this instead of `npm test` for a one-shot run. See [testing-howto.md](./testing-howto.md) for when the difference matters and [testing-explanation.md](./testing-explanation.md) for why the wrapper exists.

## release

```
zotero-plugin release
```

Bumps the version (interactive prompt by default, `preid` `beta`), runs `npm run build` through `release.bumpp.execute`, commits as `chore(publish): release v%s`, tags `v%s`, and pushes both. GitHub publishing defaults to `"ci"`, so running this locally stops at the push.

The tag push triggers `.github/workflows/release.yml`, which calls the reusable `zotero-plugin-dev/workflows/.github/workflows/release-plugin.yml` and runs this same script inside Actions. There it skips the bump, builds, generates a changelog, and creates the `v<version>` release with the `.xpi` attached plus the `release` release holding `update.json` and `update-beta.json`.

The release URLs are templated from `repository.url` in `package.json`. A wrong owner or repo there produces a release pointing at the wrong place, with no error. See [configuration-reference.md](./configuration-reference.md).

[releasing-howto.md](./releasing-howto.md) walks through an actual release, including the arguments for a beta and what to do when a step fails.

## update-deps

```
npm update --save
```

Updates dependencies within their declared semver ranges and writes the new ranges back to `package.json`. Two dependencies are pinned to exact prerelease versions and will not move: `zotero-plugin-toolkit` at `5.1.0-beta.13` and `zotero-types` at `4.1.0-beta.4`. Everything else uses a caret range.

Adding a new dependency is a separate decision, not something this script covers.
