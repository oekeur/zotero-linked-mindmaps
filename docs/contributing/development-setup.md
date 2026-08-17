# Development setup

This gets you from a fresh clone to a running Zotero with the plugin loaded and hot-reloading.

## Before you start

Install Zotero 7 locally. The plugin declares `strict_min_version` `6.999`, so a Zotero 6 install won't load it. Make a note of the path to the Zotero binary: on Linux that's the `zotero` launcher in the install directory, on macOS `.../Zotero.app/Contents/MacOS/zotero`, on Windows `zotero.exe`.

Create a separate Zotero profile for development, and don't point the dev server at the profile holding your real library. Run `/path/to/zotero -p` to open the profile manager and add one, or let the scaffold create a profile for you (see step 3). Zotero's own [profile directory documentation](https://www.zotero.org/support/kb/profile_directory) explains where profiles live per platform.

Install Node. Everything else (`zotero-plugin-scaffold` 0.8.x, esbuild, TypeScript 5.9) comes in through npm, so there's no separate toolchain to set up.

## Steps

1. Install dependencies:

   ```sh
   npm install
   ```

   The `prepare` script runs `husky` as part of this, which installs the `pre-commit` and `commit-msg` hooks from `.husky/`. Commit without those hooks in place and Prettier, ESLint and commitlint never run on your work.

2. Copy the environment template:

   ```sh
   cp .env.example .env
   ```

   `.env` is gitignored. The scaffold loads it through dotenv on every command.

3. Fill in `.env`. Only two variables matter for a first run:

   `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` is the absolute path to the Zotero binary. The scaffold checks the file exists and throws `The Zotero binary not found.` if it doesn't.

   `ZOTERO_PLUGIN_PROFILE_PATH` is the absolute path to the dev profile. If the directory doesn't exist, the scaffold creates and initializes it on first launch, since `server.createProfileIfMissing` defaults to true. Pointing this at a path that doesn't exist yet is a perfectly good way to get a clean profile.

   `ZOTERO_PLUGIN_DATA_DIR` is optional, but think about it before you skip it. Left empty, Zotero starts against its default data directory, which is your real library. Set it to a directory of your own if you'd rather the dev instance had its own database. See [configuration-reference.md](./configuration-reference.md) for the remaining variables.

4. Start the dev server:

   ```sh
   npm start
   ```

   This runs `prestart` first (see below), then `zotero-plugin serve`, which builds `src/` and `addon/` into `.scaffold/build/`, launches Zotero against your dev profile with the built plugin installed as a temporary add-on, and watches `src/` and `addon/` so edits rebuild and reload without a restart.

5. Confirm the plugin actually loaded. Open Tools, then Plugins, and look for "Zotero Linked Mindmaps". A silent absence here usually means a `strict_max_version` mismatch in `addon/manifest.json`. Zotero refuses to load the plugin, prints nothing to the console, and reports no install failure, so this check is worth the ten seconds. See [configuration-reference.md](./configuration-reference.md#addonmanifestjson).

## Gotchas that actually bite

### A stale zotero-bin process gets reused silently

`zotero-plugin serve` passes `no-remote` when it spawns Zotero, but a Zotero process left over from a crashed session, or one you launched normally, can still end up holding the profile. What you see is a build that succeeds while the running Zotero cheerfully keeps showing the old behavior, so your fix looks like it did nothing at all.

`npm start` already guards against this. `prestart` runs `scripts/clean-dev-profile.mjs`, which issues `pkill -9 -f zotero-bin` before the server starts. If you invoke `npx zotero-plugin serve` directly, or you're on a platform where that `pkill` invocation doesn't match, run it yourself first:

```sh
pkill -9 -f zotero-bin
```

The same script also strips leftover tabs whose `type` starts with `zoterolinkedmindmaps-` out of `<profile>/session.json`. Zotero restores session tabs before plugins register their tab types, so a stale mindmap tab from a previous run can crash startup inside core `tabs.js` or `itemTree.js`, with an error that looks like it has nothing to do with your change.

### Two checkouts must not share one dev profile

`ZOTERO_PLUGIN_PROFILE_PATH` and `ZOTERO_PLUGIN_DATA_DIR` each name one fixed directory. Copy `.env` verbatim into a second checkout (a git worktree, a second clone) and run `npm start` there while the first is running, and both Zotero instances attach to the same profile and data directory. Expect crashes, stale state, and failures with no error message pointing anywhere near the cause.

Give each checkout its own profile instead. In the copied `.env`, repoint both variables at paths under that checkout that don't exist yet:

```sh
ZOTERO_PLUGIN_PROFILE_PATH = /abs/path/to/second-checkout/.scaffold/dev-profile
ZOTERO_PLUGIN_DATA_DIR = /abs/path/to/second-checkout/.scaffold/dev-data
```

The scaffold initializes both on first launch, and `.scaffold/` is gitignored, so nothing leaks into the repo.

`npm test` needs none of this. The test runner hardcodes its profile and data directories to `.scaffold/test/profile` and `.scaffold/test/data` relative to the current working directory, empties them at the start of every run, and picks a free TCP port for the debugger server at launch. Concurrent test runs across checkouts are already isolated from each other. See [testing-howto.md](./testing-howto.md).

### The Browser Toolbox needs a binary path on Zotero 9

Official Zotero release builds do ship the Firefox DevTools. Zotero 9.0.6's `app/omni.ja` carries the same 2345 `chrome/devtools/**` entries as the 10.x beta, registered as chrome, so the build page's claim that `-jsdebugger` is "not available in release builds" does not describe 9.x. What is true is that the bare flag does nothing on 9.

The launcher starts the toolbox as a second process, using `XREExeF` (the executable, `zotero-bin`) with no `-app` argument. That child boots as generic Firefox, dies on `Failed to load resource:///modules/DevToolsStartup.sys.mjs`, and the parent then tears down the DevTools server it had just started. None of it is printed unless `browser.dom.window.dump.enabled` is on, so it reads as a build without devtools. The 10.x beta patches the one line responsible in `Launcher.sys.mjs`:

```js
let command = Services.dirsvc.get("XREExeF", Ci.nsIFile).path;
command = command.replace("zotero-bin", "zotero");
```

9.0.6 ships it unpatched.

`--jsdebugger` also takes a binary path, which sets `MOZ_BROWSER_TOOLBOX_BINARY`. Point it at Zotero's own `zotero` launcher script, which adds `-app` itself. `zotero-plugin.config.ts` does this for `npm start`, deriving the path from `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`; the path form works on 10 as well, so it is not version-gated. For a Zotero you launch by hand:

```sh
/path/to/zotero -jsconsole -jsdebugger /path/to/zotero
```

A hand-launched Zotero needs one more thing: `devtools.debugger.remote-enabled` set to true in its profile. Zotero's defaults set `devtools.chrome.enabled` only, Gecko defaults the other to false, and `-jsdebugger` is a no-op without both. The scaffold writes the pref into the profile itself, so `npm start` and `npm test` never hit this.

## Running against Zotero 9 or 10

`.env` names one Zotero binary, and `npm start` and `npm test` use it. That default is the 10.x beta, because the dev library `ZOTERO_PLUGIN_DATA_DIR` points at has been upgraded to userdata schema 129 and Zotero 9 will not open it.

To run the dev server against either version:

```sh
scripts/serve.sh 9
scripts/serve.sh 10
```

Both read their binary from `.env`, so set `ZOTERO9_BIN` and `ZOTERO10_BIN` to the two `zotero` launcher scripts (the shell script, not `zotero-bin`).

Target 9 does not reuse the profile and data directory named in `.env`. It appends `-zotero9` to both and lets the scaffold create them, so the first run comes up with an empty library. That split is forced, not a preference: Zotero 10 stamps the database's `compatibility` value at 9, Zotero 9's `_maxCompatibility` is 7, and 9 aborts with "Database is incompatible with this Zotero version" instead of downgrading. Nothing migrates a library back, so the two versions keep separate ones.

Because the suffix is derived from whatever `.env` currently holds, a worktree whose `.env` the worktree hook has repointed gets a worktree-local Zotero 9 profile as well, with no extra setup.

Only one Zotero runs at a time. `prestart` runs `pkill -9 -f zotero-bin` before the server starts, so launching either target kills whatever Zotero was already up.

## Next

[npm-scripts-reference.md](./npm-scripts-reference.md) lists every script and what it produces, and [testing-howto.md](./testing-howto.md) covers running the suite. If you want to see what the plugin does from a user's side, start at [getting-started.md](../user-guide/getting-started.md). For how startup and shutdown are wired, [lifecycle-reference.md](../internals/lifecycle-reference.md).
