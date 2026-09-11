# Reproduction

## Static proof, from upstream HEAD

Two facts from the template's own tree, fetched 2026-08-17:

```
$ gh api repos/windingwind/zotero-plugin-template/contents/addon/locale/en-US --jq '.[].name'
addon.ftl
mainWindow.ftl
preferences.ftl

$ gh api repos/windingwind/zotero-plugin-template/contents/src/utils/locale.ts \
    -H "Accept: application/vnd.github.raw" | sed -n '9,17p'
function initLocale() {
  const l10n = new (
    typeof Localization === "undefined"
      ? ztoolkit.getGlobal("Localization")
      : Localization
  )([`${config.addonRef}-addon.ftl`], true);
  addon.data.locale = {
    current: l10n,
  };
}
```

Three files shipped, one loaded. Every key in `mainWindow.ftl` and
`preferences.ftl` is unreachable through `getString`.

## Behavioural proof, in this project

This project hit the bug with a second locale file (`mainWindow.ftl`) and
12 `getString` call sites in the mindmap tab. Symptom: toolbar buttons, the tab
title and File menu items rendered as their own message ids, for example

```
zoterolinkedmindmaps-mindmap-new-button
```

instead of the label defined in `mainWindow.ftl`. No exception, no console
output, no build failure.

Confirming which side is broken, on the same key:

- `getString("mindmap-new-button")` returns the prefixed id
- `doc.l10n.setAttributes(el, "zoterolinkedmindmaps-mindmap-new-button")`
  resolves the real label

That difference is the diagnostic. Zotero registers all `.ftl` files under
`addon/locale/<lang>/` into the window's l10n context, so markup consumers see
the file while `getString`'s hand-built bundle does not.

## Minimal reproduction from a clean template

1. Clone the template and install.
2. Add a key to `addon/locale/en-US/mainWindow.ftl`:
   `hello-from-mainwindow = Hello`
3. Call `getString("hello-from-mainwindow")` from anywhere in `src/` after
   startup, for example in `hooks.ts`, and show it with
   `ztoolkit.getGlobal("alert")`.
4. Build and run with `npm start`.

Observed: the alert reads `<addonRef>-hello-from-mainwindow`. Expected:
`Hello`.

Moving the same key into `addon/locale/en-US/addon.ftl` and rebuilding makes it
resolve, which isolates the cause to the file the bundle was constructed from.

Note that step 3 type-checks either way: the scaffold generates
`typings/i10n.d.ts` from all `.ftl` files, so `FluentMessageId` accepts the key
regardless of whether `initLocale` can resolve it. The types and the runtime
disagree, and only the runtime is wrong.

## Regression test used here

`test/mindmap/locale.test.ts` runs against a live Zotero instance and asserts
the symptom directly:

```ts
it("registers every shipped .ftl file with getString's bundle", function () {
  assert.deepEqual(
    FILES.filter((file) => !LOCALE_FILES.includes(file)),
    [],
    "shipped .ftl files that initLocale does not load, whose keys getString renders as raw ids",
  );
});
```

and, per shipped file:

```ts
it(`getString resolves every message id in ${file}.ftl`, async function () {
  const parsed = messages(await localeSource("en-US", file));
  assert.isNotEmpty(parsed);
  const unresolved = parsed
    .filter((message) => resolve(message) === message.id)
    .map((message) => message.id);
  assert.deepEqual(
    unresolved,
    [],
    `keys getString renders as raw ids; check that "${file}" is in LOCALE_FILES`,
  );
});
```

The second assertion is the one that generalises: it compares each resolved
string against the id it came from, so it fails for any cause that leaves a key
unresolved, not only a stale file list. It also has to supply the attribute
branch for messages carrying only `.label` or `.tooltiptext`, since `getString`
falls back to the raw id for those unless asked for the branch, and would
otherwise report them as false positives.
