# Configuration reference

Every value a contributor sets or has to get right, across `.env`, `package.json`, and `addon/manifest.json`.

Several of these fail silently. A wrong value produces a successful build, no console error, and a plugin that does not install or does not load. Those are marked below.

## .env

Copy from `.env.example`; `.env` is gitignored. The scaffold loads it through dotenv on every command. If you develop more than one Zotero plugin, the binary and profile paths can live in your system environment instead and be omitted here.

### ZOTERO_PLUGIN_ZOTERO_BIN_PATH

Absolute path to the Zotero executable. On Windows escape the delimiter as `\\`; on macOS the path ends `.../Zotero.app/Contents/MacOS/zotero`.

Read by `npm start` and by the test runner. The scaffold checks the file exists and throws `The Zotero binary not found.` if it does not. Missing or wrong fails loudly.

### ZOTERO_PLUGIN_PROFILE_PATH

Absolute path to the Zotero profile the dev server launches against. Create one with `/path/to/zotero -p`, or name a path that does not exist yet: `server.createProfileIfMissing` defaults to true, so the scaffold initializes a fresh profile there on first launch.

Also read by `scripts/clean-dev-profile.mjs` to locate `<profile>/session.json`. If the variable is absent from `.env`, that script skips the session cleanup and warns.

The test runner ignores this. It hardcodes `.scaffold/test/profile`, resolved relative to the working directory.

Two checkouts pointing this at the same directory and running `npm start` at once will collide. See [development-setup.md](./development-setup.md#two-checkouts-must-not-share-one-dev-profile).

### ZOTERO_PLUGIN_DATA_DIR

Directory holding the Zotero database the dev instance uses. Empty means Zotero starts against its default data directory, which is your real library. Set it to a path of your own to give the dev instance an isolated database.

Passed to Zotero as `--dataDir`. The test runner ignores this too; it uses `.scaffold/test/data`.

### ZOTERO_PLUGIN_KILL_COMMAND

Commented out in `.env.example`. Overrides the built-in per-platform command the scaffold uses to kill Zotero processes. Set it only if the built-in command does not match on your system.

Note that neither `scripts/clean-dev-profile.mjs` nor `scripts/run-tests.mjs` consults this variable. `clean-dev-profile.mjs` matches on `ZOTERO_PLUGIN_PROFILE_PATH` appearing in a running Zotero's `-profile` argument; `run-tests.mjs` kills its own process group instead and so matches on nothing at all.

### GITHUB_TOKEN

Commented out in `.env.example`. Needed only to run `npm run release` from your own machine rather than from CI, where the scaffold creates the GitHub release and uploads assets. `release.github.enable` defaults to `"ci"`.

## package.json

### config

Five values consumed by `zotero-plugin.config.ts`, which spreads the whole block into `build.define` so each becomes a `__name__` substitution token in `addon/**`.

| Key             | Current value                            | Used as                                                                                                                                                                                                        |
| --------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addonName`     | `Zotero Linked Mindmaps`                 | Scaffold `name`; `__addonName__` in `manifest.json`; the display name under Tools, then Plugins                                                                                                                |
| `addonID`       | `zoterolinkedmindmaps@oekeur.github.io`  | Scaffold `id`; `applications.zotero.id` in the built manifest; the plugin id Zotero installs and updates under                                                                                                 |
| `addonRef`      | `zoterolinkedmindmaps`                   | Scaffold `namespace`; the esbuild output filename (`content/scripts/zoterolinkedmindmaps.js`); the DOM id prefix for injected elements; the tab-type prefix `clean-dev-profile.mjs` strips from `session.json` |
| `addonInstance` | `ZoteroLinkedMindmaps`                   | The key the plugin registers itself under on the `Zotero` global, so `Zotero.ZoteroLinkedMindmaps`; used by `waitForPlugin` and by tests                                                                       |
| `prefsPrefix`   | `extensions.zotero.zoterolinkedmindmaps` | `build.prefs.prefix`; prepended to every key in `addon/prefs.js` at build time and reflected in the generated `typings/prefs.d.ts`                                                                             |

All five are set and correct. Changing `addonID` after a release changes the plugin's identity to Zotero, so an existing install will not see it as an update. Changing `addonInstance` breaks `waitForPlugin` in `zotero-plugin.config.ts` and every test that reads `Zotero[config.addonInstance]`. Changing `addonRef` invalidates any tab type already persisted in a dev profile's `session.json`, which crashes session restore until `npm run clean:profile` clears it.

Preference keys themselves are covered in [prefs-reference.md](../internals/prefs-reference.md).

### repository.url

Currently `git+https://github.com/oekeur/zotero-linked-mindmaps.git`, matching the actual git remote. Correct as set.

Fails silently if wrong. The scaffold parses this into `{{owner}}` and `{{repo}}` and substitutes them into `updateURL` and `xpiDownloadLink` in `zotero-plugin.config.ts`, and into the GitHub repository the release command targets. A wrong owner or repo produces a build that succeeds and a `manifest.json` whose `update_url` points at a repository that does not exist. Nothing errors at build time; the failure surfaces later, when an installed copy tries to check for updates.

### homepage

Currently `https://github.com/oekeur/zotero-linked-mindmaps`. Correct as set.

Fails silently if wrong or missing. It becomes `__homepage__` in `build.define` and lands in the built manifest as `homepage_url`. A missing or placeholder value breaks install with no build-time signal.

### Other fields

`version` (`0.1.0`) drives `__buildVersion__` and the manifest's `version`; a version string containing a hyphen makes the scaffold treat the build as a prerelease and emit `update-beta.json` instead of `update.json`. `name`, `description`, `author`, and `license` (`AGPL-3.0-or-later`) are conventional. `private: true` prevents accidental publication to the npm registry. `type: "module"` is what lets `scripts/*.mjs` and the `.mjs` configs use ESM.

`prettier` and `lint-staged` blocks are documented in [npm-scripts-reference.md](./npm-scripts-reference.md).

## addon/manifest.json

This file is a template, not the shipped manifest. The build copies it into `.scaffold/build/addon/manifest.json`, substitutes the `__name__` tokens, then merges in generated values for `applications.zotero.id` and `applications.zotero.update_url`.

```json
{
  "manifest_version": 2,
  "name": "__addonName__",
  "version": "__buildVersion__",
  "description": "__description__",
  "homepage_url": "__homepage__",
  "author": "__author__",
  "icons": {
    "48": "content/icons/favicon@0.5x.png",
    "96": "content/icons/favicon.png"
  },
  "applications": {
    "zotero": {
      "id": "__addonID__",
      "update_url": "__updateURL__",
      "strict_min_version": "6.999",
      "strict_max_version": "10.*"
    }
  }
}
```

`manifest_version` is 2. Zotero 7 uses the WebExtension manifest format at version 2; do not raise it.

`name`, `version`, `description`, `homepage_url`, `author`, `id`, and `update_url` are substitution tokens. Their sources are the `package.json` fields above plus `zotero-plugin.config.ts`. Editing the literal token text here without a matching key in `build.define` leaves the raw `__token__` string in the shipped manifest.

`icons` are paths relative to the built addon root, resolved against `addon/content/icons/`.

`strict_min_version` is `6.999`. Zotero 7 betas report versions above 6.999 and below 7, so this is the conventional way to say "Zotero 7 or later" and exclude Zotero 6.

`strict_max_version` is `10.*`. **This one fails silently.** If a Zotero version exceeds the ceiling, Zotero refuses to load the plugin: no console error, no install failure, no message anywhere. The only symptom is the plugin's absence from Tools, then Plugins. The ceiling is deliberately far above any shipping Zotero so that a routine Zotero update does not silently disable the plugin during development. Check this field whenever the plugin stops appearing after a Zotero upgrade.

## Fields that fail silently, collected

Three, all confirmed by the failure modes this project has hit:

`repository.url` in `package.json`, wrong owner or repo produces a valid build with an update URL pointing nowhere.

`homepage` in `package.json`, missing or placeholder breaks install with no build-time signal.

`strict_max_version` in `addon/manifest.json`, too low blocks loading with no console output at all.

Check all three before shipping any change to `package.json` or the manifest. Nothing in the build, the linter, or the type checker will flag them.

## Related

[development-setup.md](./development-setup.md) for filling `.env` the first time. [npm-scripts-reference.md](./npm-scripts-reference.md) for what reads each of these. [prefs-reference.md](../internals/prefs-reference.md) for the preference keys under `prefsPrefix`, and [locale-reference.md](../internals/locale-reference.md) for the Fluent files under `addon/locale/`.
