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

`addon.ftl` carries startup strings, the preferences-pane strings, the container-trashed warnings, and the item context-menu labels. `mainWindow.ftl` carries the Mindmaps section, the add-link form, the mindmap tab and its sidebar, and the grouping menu entries.

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

**Window l10n contexts**, which `data-l10n-id` attributes resolve against. `onMainWindowLoad` calls `win.MozXULElement.insertFTLIfNeeded("zoterolinkedmindmaps-mainWindow.ftl")` for each main window. The item-pane section registered through `Zotero.ItemPaneManager.registerSection` takes `l10nID` values (built with `getLocaleID`) and Zotero resolves them itself. A window the plugin opens for itself gets neither; see [the bundle-scope limit](#the-bundle-scope-limit).

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

A message with no value of its own, only attributes such as `.label` or `.tooltiptext`, resolves to the raw id unless the branch is asked for. `item-mindmaps-section-head-text` and `item-mindmaps-add-link-header-button` are both of that shape.

`args` feeds Fluent's own placeables and selectors. `add-to-mindmap-progress` takes `$count`; `mindmap-delete-confirm-message` takes `$title`; `preferences-delete-confirm-used` selects a plural form on `$count`.

`getString` reads the plugin singleton through the bare `addon` global. The test bundle is a separate scope, so tests that call it point their own `addon` at `Zotero[config.addonInstance]` in a `before` hook.

## `getLocaleID(id: FluentMessageId): string`

Returns `` `${config.addonRef}-${id}` ``. For passing an id to something that resolves Fluent itself, rather than resolving it here. Used for the `l10nID` fields of the Mindmaps item-pane section.

## The bundle-scope limit

`initLocale()`'s bundle belongs to the plugin scope. It does not add the plugin's `.ftl` files to any window's l10n context, and `insertFTLIfNeeded` only reaches the main windows the plugin loads into.

Zotero's preferences window is a partial exception, scoped per pane rather than window-wide. `Zotero.PreferencePanes.register` loads each pane's `src` as an XHTML fragment and, once, the first time that pane is opened, awaits `document.l10n.ready` and calls `document.l10n.translateFragment(pane.container)` (see `chrome/content/zotero/preferences/preferences.js` in Zotero's own source). That resolves `data-l10n-id` against whatever the fragment's own `<linkset>` declares, the same declarative pattern `addon/content/addLink.xhtml` uses (below) and the one the community plugin-dev docs document for preference panes. `addon/content/preferences.xhtml` declares one for `zoterolinkedmindmaps-addon.ftl`, and both groupbox headings plus the hide-plugin-data checkbox and its help text carry `data-l10n-id` and resolve for real.

The link-types list is the one part of that pane still built from code, through `getString`, and the reason is not a missing l10n context: it is that `translateFragment` runs exactly once, when the pane's static fragment is first inserted. `renderLinkTypesSettings` tears its container down and rebuilds it from scratch on every selection, add, edit, and delete, and none of those later insertions gets a translation pass. `getString` sidesteps that because it reads the plugin's own Fluent bundle directly, independent of any window's l10n context, so it resolves the same way on every rebuild.

The pane's own label, the one Zotero shows in the preferences sidebar, goes through `getString("preferences-pane-label")` at `Zotero.PreferencePanes.register` time.

`test/mindmap/preferencesPane.test.ts` guards the static half by asserting the two group headings resolve to real text, not a raw id, and guards the dynamic half by exercising selection, add, edit and delete through the rendered controls.

A `ztoolkit.Dialog` window has no l10n context at all. It opens `about:blank`, so it starts with no plugin strings of any kind, and a form built with `data-l10n-id` renders every label and button blank rather than showing a raw id.

The standalone "Add link" window used to be one, and worked around that by naming the file in `dialogData.l10nFiles`. It no longer is: `addon/content/addLink.xhtml` is the plugin's own chrome document, opened through `openDialog` at `chrome://zoterolinkedmindmaps/content/addLink.xhtml`, and it registers the file the same declarative way Zotero's own dialogs do:

```xml
<linkset>
  <html:link rel="localization" href="zoterolinkedmindmaps-mainWindow.ftl" />
</linkset>
```

Three separate defects drove that change, all of them properties of the blank window rather than of the form: no Fluent strings, a `sizeToContent` on a timer the form's async render outlasts, and an HTML `select` whose dropdown does not open at all. The item pane and the mindmap tab never had any of the three, because they render into the main window.

`test/mindmap/addLinkDialog.test.ts` guards the first two by opening the real dialog and failing on an empty label or button, or on a Save button below the window's bottom edge. The third is not directly testable - whether a native dropdown opens can only be seen by clicking it - so the test checks the nearest observable thing, that the field is a real HTML `select` in the XHTML namespace carrying its options.

## Adding a string

Add the key to `addon/locale/en-US/<file>.ftl` and to `addon/locale/nl-NL/<file>.ftl`. `test/mindmap/locale.test.ts` compares message ids between the two locales in both directions, so a key in one and not the other fails the suite. It compares ids only, never translations.

Translations are added only in languages the project can verify, currently English and Dutch.

If the string lands in a new `.ftl` file, add the filename to `LOCALE_FILES` as well.

## Wording rules the suite enforces

`test/mindmap/locale.test.ts` checks more than key parity. These are asserted per locale, so they cannot drift back silently:

- No string stands a spaced hyphen in for punctuation. Use a colon or a semicolon.
- No string uses the word "connection" or "verbinding" for a link, and none carries the `(plugin data)` parenthetical.
- The add-to-mindmap confirmation renders differently for one and three, so it must be a Fluent count selector rather than an `item(s)` suffix, and it names the mindmap it added to.
- The two direction options name both ends of the relation, using the type label as the verb, rather than saying forward or backward.

Two conventions are not machine-checked and need care by hand:

- An ellipsis marks a control that opens another window before anything happens. A control that acts immediately, or that reveals an inline form, does not get one. A confirmation prompt is not "more input" in this sense, so a destructive action that only asks you to confirm stays without one.
- Case follows the host surface. The library context-menu entries are Title Case in `en-US` because Zotero's own item menu is; `nl-NL` keeps sentence case because Dutch Zotero does. Everywhere the plugin owns the surface, both locales use sentence case.

## See also

- [lifecycle-reference.md](lifecycle-reference.md) for where `initLocale` and `insertFTLIfNeeded` sit in startup.
- [prefs-reference.md](prefs-reference.md) for the preference the library pane exposes.
- [testing-howto.md](../contributing/testing-howto.md) for running the locale suite.
