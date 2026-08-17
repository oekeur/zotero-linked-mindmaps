# Development setup

Get from a fresh clone to a running Zotero with the plugin loaded and hot-reloading.

## Before you start

Install Zotero 7 locally. The plugin declares `strict_min_version` `6.999`, so a Zotero 6 install will not load it. Note the path to the Zotero binary: on Linux that is the `zotero` launcher in the install directory, on macOS `.../Zotero.app/Contents/MacOS/zotero`, on Windows `zotero.exe`.

Create a separate Zotero profile for development. Do not point the dev server at the profile holding your real library. Run `/path/to/zotero -p` to open the profile manager and add one, or let the scaffold create a profile for you (see step 3). Zotero's own [profile directory documentation](https://www.zotero.org/support/kb/profile_directory) explains where profiles live per platform.

Install Node. The repo pulls in `zotero-plugin-scaffold` 0.8.x, esbuild, and TypeScript 5.9 through npm; there is no separate toolchain to install.

## Steps

1. Install dependencies:

   ```sh
   npm install
   ```

   The `prepare` script runs `husky` as part of this, which installs the `pre-commit` and `commit-msg` hooks from `.husky/`. Committing without those hooks means Prettier, ESLint, and commitlint never run on your commits.

2. Copy the environment template:

   ```sh
   cp .env.example .env
   ```

   `.env` is gitignored. The scaffold loads it through dotenv on every command.

3. Fill in `.env`. Only two variables matter for a first run:

   `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` is the absolute path to the Zotero binary. The scaffold checks that the file exists and throws `The Zotero binary not found.` if it does not.

   `ZOTERO_PLUGIN_PROFILE_PATH` is the absolute path to the dev profile. If the directory does not exist, the scaffold creates and initializes it on first launch, because `server.createProfileIfMissing` defaults to true. Pointing this at a path that does not exist yet is a valid way to get a clean profile.

   `ZOTERO_PLUGIN_DATA_DIR` is optional. Left empty, Zotero starts against its default data directory, which is your real library. Set it to a directory of your own if you want the dev instance to have its own database. See [configuration-reference.md](./configuration-reference.md) for the remaining variables.

4. Start the dev server:

   ```sh
   npm start
   ```

   This runs `prestart` first (see below), then `zotero-plugin serve`: it builds `src/` and `addon/` into `.scaffold/build/`, launches Zotero against your dev profile with the built plugin installed as a temporary add-on, and watches `src/` and `addon/` so edits rebuild and reload without a restart.

5. Confirm the plugin actually loaded. Open Tools, then Plugins, and look for "Zotero Linked Mindmaps". A silent absence here is the usual symptom of a `strict_max_version` mismatch in `addon/manifest.json`: Zotero refuses to load the plugin, prints nothing to the console, and reports no install failure. See [configuration-reference.md](./configuration-reference.md#addonmanifestjson).

## Gotchas that actually bite

### A stale zotero-bin process gets reused silently

`zotero-plugin serve` passes `no-remote` when it spawns Zotero, but a Zotero process left over from a crashed session, or one launched normally by you, can still end up holding the profile. The visible symptom is a build that succeeds while the running Zotero keeps showing the old behavior, so a fix looks like it did nothing.

`npm start` guards against this already: `prestart` runs `scripts/clean-dev-profile.mjs`, which issues `pkill -9 -f zotero-bin` before the server starts. If you invoke `npx zotero-plugin serve` directly, or you are on a platform where that `pkill` invocation does not match, run it yourself first:

```sh
pkill -9 -f zotero-bin
```

The same script also strips leftover tabs whose `type` starts with `zoterolinkedmindmaps-` out of `<profile>/session.json`. Zotero restores session tabs before plugins register their tab types, so a stale mindmap tab from a previous run can crash startup inside core `tabs.js` or `itemTree.js` with an error that looks unrelated to your change.

### Two checkouts must not share one dev profile

`ZOTERO_PLUGIN_PROFILE_PATH` and `ZOTERO_PLUGIN_DATA_DIR` name one fixed directory each. If you copy `.env` verbatim into a second checkout (a git worktree, a second clone) and run `npm start` there while the first is running, both Zotero instances attach to the same profile and data directory. That produces crashes, stale state, and failures with no error message pointing at the cause.

Give each checkout its own profile. In the copied `.env`, repoint both variables at paths under that checkout that do not exist yet:

```sh
ZOTERO_PLUGIN_PROFILE_PATH = /abs/path/to/second-checkout/.scaffold/dev-profile
ZOTERO_PLUGIN_DATA_DIR = /abs/path/to/second-checkout/.scaffold/dev-data
```

The scaffold initializes both on first launch. `.scaffold/` is gitignored, so nothing leaks into the repo.

`npm test` does not need this treatment. The test runner hardcodes its profile and data directories to `.scaffold/test/profile` and `.scaffold/test/data` relative to the current working directory, empties them at the start of every run, and picks a free TCP port for the debugger server at launch. Concurrent test runs across checkouts are already isolated. See [testing-howto.md](./testing-howto.md).

## Next

[npm-scripts-reference.md](./npm-scripts-reference.md) lists every script and what it produces. [testing-howto.md](./testing-howto.md) covers running the suite. For what the plugin does from a user's side, start at [getting-started.md](../user-guide/getting-started.md); for how startup and shutdown are wired, [lifecycle-reference.md](../internals/lifecycle-reference.md).
