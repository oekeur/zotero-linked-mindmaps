# Locale reference

`src/utils/locale.ts` holds the plugin's Fluent bundle and the string lookup built on it. The `.ftl` files themselves live under `addon/locale/<lang>/`.

## Shipped files

Two files per locale, in two locales:

```
addon/locale/en-US/addon.ftl
addon/locale/en-US/mainWindow.ftl
addon/locale/nl-NL/addon.ftl
addon/locale/nl-NL/mainWindow.ftl
```

`addon.ftl` carries startup strings, the preferences-pane strings, the container-trashed warnings, and the item context-menu labels. `mainWindow.ftl` carries the Connections panel, the add-link form, the mindmap tab and its sidebar, and the grouping menu entries.

No `zh-CN` locale ships. The template's version had two of forty-odd strings translated and nobody on the project can verify Chinese, so it was removed; a `zh-CN` profile falls back to `en-US`. `test/mindmap/locale.test.ts` asserts it stays removed.

## Build-time rewriting

`zotero-plugin-scaffold` rewrites both the filenames and the message ids at build time, prefixing each with `config.addonRef`:

| Source                             | Built                                                   |
| ---------------------------------- | ------------------------------------------------------- |
| `addon/locale/en-US/addon.ftl`     | `locale/en-US/zoterolinkedmindmaps-addon.ftl`           |
| `startup-begin = Addon is loading` | `zoterolinkedmindmaps-startup-begin = Addon is loading` |

Source files therefore contain unprefixed ids, and every runtime lookup works in prefixed ones. `getString` and `getLocaleID` add the prefix themselves.

## Registration

Zotero discovers `.ftl` files by scanning the built add-on's `locale/<lang>/` directories. There is no entry in `manifest.json` and no call in `bootstrap.js` that registers them. Dropping a file into `addon/locale/en-US/` is the whole registration step for the `data-l10n-id` path.

Two separate consumers resolve those files, and they do not share a registry:

**Window l10n contexts**, which `data-l10n-id` attributes resolve against. `onMainWindowLoad` calls `win.MozXULElement.insertFTLIfNeeded("zoterolinkedmindmaps-mainWindow.ftl")` for each main window. The item-pane section registered through `Zotero.ItemPaneManager.registerSection` takes `l10nID` values (built with `getLocaleID`) and Zotero resolves them itself.

**The plugin's own bundle**, which `getString` formats against. That bundle is built by `initLocale()` from `LOCALE_FILES` and nothing else.

## `LOCALE_FILES`

```ts
const LOCALE_FILES = ["addon", "mainWindow"];
```

Every `.ftl` file the plugin ships, without the `addonRef` prefix the build adds. Exported so tests can check it.

A shipped file left out of this list makes each of its keys render as its own raw id: no error, no warning, just `zoterolinkedmindmaps-mindmap-new-button` on a button. Keys read through `data-l10n-id` are unaffected, since Zotero registers the files into the window's l10n context separately, which is what makes the gap easy to miss.

`test/mindmap/locale.test.ts` fails when a shipped file is missing from the list, and separately asserts that `getString` resolves every message id in each shipped `en-US` file.

## `initLocale(): void`

Constructs a `Localization` over the prefixed filenames and stores it at `addon.data.locale.current`:

```ts
new Localization(
  LOCALE_FILES.map((name) => `${config.addonRef}-${name}.ftl`),
  true,
);
```

The second argument makes the bundle synchronous, which is what lets `getString` be a plain function.

`Localization` is reached through `ztoolkit.getGlobal("Localization")` when the bare identifier is undefined in the current scope, and used directly otherwise.

Called once, from `onStartup`, immediately after the Zotero readiness promises resolve and before any registration that needs a label. See [lifecycle-reference.md](lifecycle-reference.md).

## `getString(...)`

Three overloads over one implementation:

```ts
getString(localString: FluentMessageId): string
getString(localString: FluentMessageId, branch: string): string
getString(localString: FluentMessageId, options: { branch?: string; args?: Record<string, unknown> }): string
```

Any other arity throws `Invalid arguments`.

`FluentMessageId` is the union of every message id, generated into `typings/i10n.d.ts` by the scaffold, so an id that does not exist is a type error rather than a runtime surprise.

The implementation prefixes the id with `config.addonRef`, calls `addon.data.locale?.current.formatMessagesSync([{ id, args }])` and takes the first result.

Return value, in order:

- the prefixed id, when no pattern came back (bundle missing, file not in `LOCALE_FILES`, id not in the file);
- with `branch` given and the pattern carrying attributes, the value of the attribute named by `branch`, falling back to the prefixed id;
- otherwise `pattern.value`, falling back to the prefixed id.

A message with no value of its own, only attributes such as `.label` or `.tooltiptext`, resolves to the raw id unless the branch is asked for. `connections-section-head-text` and `connections-add-link-header-button` are both of that shape.

`args` feeds Fluent's own placeables and selectors. `add-to-mindmap-progress` takes `$count`; `mindmap-delete-confirm-message` takes `$title`; `preferences-delete-confirm-used` selects a plural form on `$count`.

`getString` reads the plugin singleton through the bare `addon` global. The test bundle is a separate scope, so tests that call it point their own `addon` at `Zotero[config.addonInstance]` in a `before` hook.

## `getLocaleID(id: FluentMessageId): string`

Returns `` `${config.addonRef}-${id}` ``. For passing an id to something that resolves Fluent itself, rather than resolving it here. Used for the `l10nID` fields of the Connections item-pane section.

## The bundle-scope limit

`initLocale()`'s bundle belongs to the plugin scope. It does not add the plugin's `.ftl` files to any window's l10n context, and `insertFTLIfNeeded` only reaches the main windows the plugin loads into.

Zotero's preferences window is neither. It has no l10n context for the plugin's files, so a `data-l10n-id` attribute in `addon/content/preferences.xhtml` does not resolve, and the element renders with no text at all.

The workaround is to set the text from code, through the same `getString` path everything else uses. `addon/content/preferences.xhtml` carries the hide-plugin-data checkbox with no label attribute and an `onload` handler that calls `hooks.onPrefsEvent("library-pane-load", { checkbox })`; the hook does:

```ts
(data.checkbox as Element | null)?.setAttribute(
  "label",
  getString("preferences-hide-mindmap-notes"),
);
```

The link-types pane in the same file is built entirely from code for the same reason, which is why `renderLinkTypesSettings` calls `getString` for its heading, its column headers, and every button.

The pane's own label, the one Zotero shows in the preferences sidebar, goes through `getString("preferences-pane-label")` at `Zotero.PreferencePanes.register` time.

`test/mindmap/preferencesPane.test.ts` guards this by asserting the rendered heading does not contain `zoterolinkedmindmaps-`, which is what a raw id would look like.

## Adding a string

Add the key to `addon/locale/en-US/<file>.ftl` and to `addon/locale/nl-NL/<file>.ftl`. `test/mindmap/locale.test.ts` compares message ids between the two locales in both directions, so a key in one and not the other fails the suite. It compares ids only, never translations.

Translations are added only in languages the project can verify, currently English and Dutch.

If the string lands in a new `.ftl` file, add the filename to `LOCALE_FILES` as well.

## See also

- [lifecycle-reference.md](lifecycle-reference.md) for where `initLocale` and `insertFTLIfNeeded` sit in startup.
- [prefs-reference.md](prefs-reference.md) for the preference the library pane exposes.
- [testing-howto.md](../contributing/testing-howto.md) for running the locale suite.
