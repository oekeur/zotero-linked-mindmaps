**Title:** `initLocale` loads only `addon.ftl`, so `getString` cannot resolve keys from the other two shipped .ftl files

### Summary

`src/utils/locale.ts` builds the `Localization` bundle from
`[`${config.addonRef}-addon.ftl`]`, but the template ships three locale files:
`addon.ftl`, `mainWindow.ftl` and `preferences.ftl`. Any key defined in the
latter two and read through `getString` returns its own prefixed id as the
string, because `_getString` falls back to `localStringWithPrefix` when the
bundle has no pattern for it. No exception, no warning, no build error. The UI
shows text like `myplugin-mainwindow-some-label` where the label should be.

### Why it is hard to spot

`data-l10n-id` consumers are unaffected: Zotero registers every `.ftl` under
`addon/locale/<lang>/` into the window's l10n context, so
`doc.l10n.setAttributes(el, id)` resolves the same key that `getString` fails
on. Two code paths with two different bundles, one complete and one hardcoded to
a single file.

The generated `typings/i10n.d.ts` also accepts the key, since the scaffold
enumerates all `.ftl` files when generating it. So the call type-checks, the key
exists in the built `.ftl`, the same key works in markup, and only `getString`
returns the wrong thing.

### Reproduction

From a clean template:

1. Add `hello-from-mainwindow = Hello` to `addon/locale/en-US/mainWindow.ftl`.
2. Call `getString("hello-from-mainwindow")` anywhere in `src/` after startup.
3. `npm start`.

Observed: `<addonRef>-hello-from-mainwindow`. Expected: `Hello`.

Moving the key into `addon.ftl` makes it resolve, which isolates the cause.

In our plugin this hit 12 call sites (toolbar labels, a tab title, File menu
items) after adding a second locale file, and cost a debugging session because
the same keys worked in markup.

### Suggested fix

The scaffold already enumerates `addon/locale/**/*.ftl` at build time to
generate `typings/i10n.d.ts`, so the file set is known. Preferred: have the
build emit that list and have `initLocale` consume it, so adding a `.ftl` file
needs no further edit. Alternative: enumerate at runtime with
`IOUtils.getChildren` from the add-on root.

A smaller version that still closes the trap is an explicit list. That is what
we did:

```ts
const LOCALE_FILES = ["addon", "mainWindow"];

function initLocale() {
  const l10n = new (...)(
    LOCALE_FILES.map(name => `${config.addonRef}-${name}.ftl`),
    true,
  );
  addon.data.locale = { current: l10n };
}
```

with a test asserting that `getString` resolves every message id in every
shipped `.ftl` rather than just that the list is current. Happy to open a PR
along either line.

### Environment

`windingwind/zotero-plugin-template@HEAD`, checked 2026-08-17. Also present in
every earlier version we looked at.
