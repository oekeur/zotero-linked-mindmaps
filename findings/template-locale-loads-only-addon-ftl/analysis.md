# initLocale loads only addon.ftl while the template ships three .ftl files

**Repo:** `windingwind/zotero-plugin-template`
**Location:** `src/utils/locale.ts`, `initLocale`
**Evidence:** reproduced in this project, fix and regression test already written here
**Severity:** silent. Keys render as their own raw ids in the UI

## What the code does

The template's `initLocale` constructs the `Localization` bundle from a single
file:

```ts
function initLocale() {
  const l10n = new (
    typeof Localization === "undefined"
      ? ztoolkit.getGlobal("Localization")
      : Localization
  )([`${config.addonRef}-addon.ftl`], true);
  addon.data.locale = { current: l10n };
}
```

`getString` formats against `addon.data.locale.current` and nothing else. When
a message id is not in the bundle, `_getString` returns the prefixed id
verbatim:

```ts
if (!pattern) {
  return localStringWithPrefix;
}
```

Meanwhile the template ships three locale files in
`addon/locale/en-US/`: `addon.ftl`, `mainWindow.ftl` and `preferences.ftl`.
Two of the three are unreachable through `getString`.

## The failure

Any key defined outside `addon.ftl` and read through `getString` renders as its
own id. A button label comes out as `zoterolinkedmindmaps-mindmap-new-button`.
No exception, no console warning, no build error. The string is present in the
shipped `.ftl`, spelled correctly, and still does not appear.

In this project it hit 12 call sites in the mindmap tab: toolbar labels, the tab
title, and File menu items.

## Why it is easy to misdiagnose

`data-l10n-id` consumers are unaffected. Zotero registers every `.ftl` file
found under `addon/locale/<lang>/` into the window's own l10n context, so
`doc.l10n.setAttributes(el, "key")` resolves the same key that `getString` fails
on. Two code paths, two different bundles, one of which sees all files and one
of which sees a single hardcoded file.

That asymmetry sends you looking in the wrong places: the key is in the built
`.ftl` under `dist/addon/locale/`, the id prefix is correct, the same key works
in markup, and the scaffold's own generated `typings/i10n.d.ts` lists it as a
valid `FluentMessageId`, so TypeScript approves. Nothing points at the bundle
construction.

## Fix used here

`src/utils/locale.ts` now derives the bundle from an explicit list:

```ts
const LOCALE_FILES = ["addon", "mainWindow"];

function initLocale() {
  const l10n = new (...)(
    LOCALE_FILES.map((name) => `${config.addonRef}-${name}.ftl`),
    true,
  );
  addon.data.locale = { current: l10n };
}
```

`test/mindmap/locale.test.ts` keeps the list honest with two assertions that run
against a live Zotero instance:

- every shipped `.ftl` file appears in `LOCALE_FILES`
- `getString` resolves every message id in every shipped `.ftl`, with the
  attribute branch supplied for messages that carry only `.label`/`.tooltiptext`

The second one is what actually catches the bug class, because it fails on the
symptom (a key resolving to its own id) rather than on the list being stale.

## Better fix for upstream

An explicit list is a maintenance burden the template can avoid. The scaffold
already enumerates `addon/locale/**/*.ftl` at build time to generate
`typings/i10n.d.ts`, so it knows the file set. Two options, in order of
preference:

1. Have the scaffold emit the list (or a generated `LOCALE_FILES` constant)
   alongside `i10n.d.ts`, and have `initLocale` consume it. No runtime
   enumeration, no list to update, and it stays correct when a file is added.
2. Enumerate at runtime from the add-on root with `IOUtils.getChildren`, which
   costs an async call during startup.

If neither is acceptable, the minimum is a comment at `initLocale` saying that
keys outside `addon.ftl` are invisible to `getString`, since the template
currently ships two files that fall into exactly that trap.
