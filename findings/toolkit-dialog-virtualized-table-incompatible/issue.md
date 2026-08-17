**Title:** VirtualizedTableHelper fails silently inside a DialogHelper window (no `window.require` on `about:blank`)

### Summary

`DialogHelper` opens its window with `openDialog("about:blank", ...)`, and
`VirtualizedTableHelper`'s constructor reads `win.require` with no guard. An
`about:blank` popup has no `require`, so the constructor throws
`TypeError: _require is not a function`. Because it throws on the dialog's async
load-callback path, nothing surfaces it: the dialog opens, the surrounding code
runs, the table area stays empty, and Debug Output shows nothing.

Two helpers in the same library that cannot be combined, with no diagnostic.

### Evidence

`dist/index.js:1261` (5.1.0-beta.13):

```js
const win = dialogHelper.getGlobal("openDialog")(
  "about:blank",
  targetId || "_blank",
  featureString,
  dialogData,
);
```

`dist/index.js:3032-3041`:

```js
constructor(win) {
  super();
  this.window = win;
  const Zotero$1 = this.getGlobal("Zotero");
  const _require = win.require;
  this.React = _require("react");
  ...
```

In the dialog window:

```js
typeof dialog.window.require; // "undefined"
typeof Zotero.getMainWindow().require; // "function"
```

### Reproduction

```ts
const dialog = new ztoolkit.Dialog(1, 1)
  .addCell(0, 0, {
    tag: "div",
    id: "table-container",
    styles: { height: "400px" },
  })
  .setDialogData({
    loadCallback: () => {
      const table = new ztoolkit.VirtualizedTable(dialog.window!); // throws, silently
      table
        .setContainerId("table-container")
        .setProp({
          id: "demo",
          columns: [{ dataKey: "title", label: "Title" }],
        })
        .setProp("getRowCount", () => 1)
        .setProp("getRowData", () => ({ title: "row" }))
        .render();
    },
  });
dialog.open("Demo");
```

Expected: a table. Observed: an empty container, no error anywhere.

### Impact

We built an item picker this way. The dialog opened, the `Zotero.Search` query
behind it returned results, and the table never appeared with no output to
explain why. Finding the cause meant reading the toolkit's bundled source at the
failing constructor. We eventually dropped the dialog and used Zotero's native
`selectItemsDialog` instead.

### Suggested fix

Ordered by usefulness:

1. Make the combination work, by resolving React from Zotero's main window
   rather than the target window, or by giving dialog windows access to Zotero's
   module loader. Cross-document React rendering needs real testing, so this may
   not be viable.
2. Guard the constructor and throw a clear error:

   ```js
   if (typeof win.require !== "function") {
     throw new Error(
       "VirtualizedTableHelper requires a window with Zotero's module loader. " +
         "DialogHelper windows are about:blank popups and do not have one; " +
         "use Zotero's main window or a chrome document.",
     );
   }
   ```

   One `if`, and the silent dead end becomes a one-line diagnosis.

3. Note the constraint in both helpers' docs.

Option 2 alone would have saved the debugging session. Happy to send it as a PR.

### Environment

`zotero-plugin-toolkit` 5.1.0-beta.13, Zotero 7, Linux. Both call sites present
at `HEAD` as of 2026-08-17.
