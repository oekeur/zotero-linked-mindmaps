# Reproduction

## Source, in the installed bundle

`zotero-plugin-toolkit` 5.1.0-beta.13,
`node_modules/zotero-plugin-toolkit/dist/index.js`.

Dialog window creation:

```
$ grep -n "about:blank" node_modules/zotero-plugin-toolkit/dist/index.js
1261:	const win = dialogHelper.getGlobal("openDialog")("about:blank", targetId || "_blank", featureString, dialogData);
```

Table helper constructor:

```
$ sed -n '3032,3041p' node_modules/zotero-plugin-toolkit/dist/index.js
	constructor(win) {
		super();
		this.window = win;
		const Zotero$1 = this.getGlobal("Zotero");
		const _require = win.require;
		this.React = _require("react");
		this.ReactDOM = _require("react-dom");
		this.VirtualizedTable = _require("components/virtualized-table");
		this.IntlProvider = _require("react-intl").IntlProvider;
```

No guard on `win.require`. An `about:blank` popup has none, so `_require` is
`undefined` and the first line that calls it throws.

## Minimal plugin repro

Inside a Zotero 7 plugin using the toolkit:

```ts
const dialog = new ztoolkit.Dialog(1, 1)
  .addCell(0, 0, {
    tag: "div",
    id: "table-container",
    styles: { height: "400px" },
  })
  .setDialogData({
    loadCallback: () => {
      const win = dialog.window!;
      // throws: TypeError: _require is not a function
      const table = new ztoolkit.VirtualizedTable(win);
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

Observed: the dialog opens, the container div is present, the table never
renders, and nothing appears in Debug Output. The throw happens on the async
load-callback path and is not surfaced anywhere.

Checking the window confirms the cause:

```ts
Zotero.debug(typeof dialog.window.require); // "undefined"
Zotero.debug(typeof Zotero.getMainWindow().require); // "function"
```

## Observed instance in this project

The link-target picker was built as a `ztoolkit.Dialog` containing a
`VirtualizedTableHelper` listing `Zotero.Search` results. Behavior:

- dialog opened and laid out correctly
- the search ran and returned items, verified by logging the result count
- the table area stayed empty
- no console output at all

The cause was found only by reading the bundled toolkit source at the failing
constructor. Nothing in the plugin's own code or in Zotero's Debug Output
indicated a failure, which is why this is filed as a silent-failure finding
rather than a missing feature.

Resolution here: dropped the custom dialog and used Zotero's native
`selectItemsDialog`.

## Note

Not re-run against a live Zotero for this write-up, since the plugin no longer
contains that code path. The source evidence above was verified directly today
and is sufficient to act on: the missing guard is visible in the bundle.
