# DialogHelper and VirtualizedTableHelper cannot be used together, and fail silently

**Repo:** `windingwind/zotero-plugin-toolkit`
**Location:** `DialogHelper` window creation and `VirtualizedTableHelper`'s constructor
**Evidence:** observed in this project; both call sites confirmed in the installed bundle
**Severity:** silent. The dialog opens, the table never renders, nothing logs

## The two halves

`DialogHelper` opens its window on `about:blank`
(`dist/index.js:1261` in 5.1.0-beta.13):

```js
const win = dialogHelper.getGlobal("openDialog")(
  "about:blank",
  targetId || "_blank",
  featureString,
  dialogData,
);
```

`VirtualizedTableHelper`'s constructor immediately pulls React out of the target
window's `require` (`dist/index.js:3032-3041`):

```js
constructor(win) {
  super();
  this.window = win;
  const Zotero$1 = this.getGlobal("Zotero");
  const _require = win.require;
  this.React = _require("react");
  this.ReactDOM = _require("react-dom");
  this.VirtualizedTable = _require("components/virtualized-table");
  this.IntlProvider = _require("react-intl").IntlProvider;
  ...
```

Zotero's main window has `window.require`. A bare `about:blank` popup does not.
So `_require` is `undefined` and the first call throws
`TypeError: _require is not a function`.

## Why it is silent

The throw happens inside the dialog's load callback, on the async path, so
nothing surfaces it. What the user sees:

- the dialog opens and renders its other elements
- the code behind it runs fine, including any search or query feeding the table
- the table area stays empty
- no console output, no error dialog, no rejected promise anyone observes

In this project the symptom was a link-target picker that opened, ran its
`Zotero.Search` query successfully, and displayed nothing. Diagnosing it took
reading the toolkit's bundled source in `node_modules`, because no signal
existed anywhere else.

## Why this belongs upstream rather than in a plugin's notes

Both helpers ship in the same library and are the library's obvious answer to
"open a dialog" and "show a table of items". Combining them is the natural
reading of the API surface, the types permit it, and the failure teaches nothing.

## Fix options, in order of how much they actually help

1. **Make it work.** The dialog window could inherit `require` from Zotero's main
   window, or `VirtualizedTableHelper` could resolve React from the main window
   rather than from `win`. Cross-document React rendering is genuinely risky, so
   this needs testing rather than optimism, and it may not be viable. Anyone
   attempting it should verify event handling and unmount behavior, not just
   first paint.
2. **Fail loudly.** Guard the constructor: if `typeof win.require !== "function"`,
   throw an error naming the cause and the constraint, for example that
   `VirtualizedTableHelper` needs a window with Zotero's module loader and that
   `DialogHelper` windows do not have one. One `if`, and it converts a silent
   dead end into a one-line diagnosis.
3. **Document it.** A note on both helpers' docs. Worth doing regardless, but on
   its own it only helps people who read docs before hitting the bug.

Option 2 is the one to send. It is small, safe, and addresses the part that cost
time, which was not the missing feature but the absence of any signal.

## What this project did instead

Abandoned the custom dialog and used Zotero's native `selectItemsDialog` for
item selection. That turned out better anyway, and it is now a standing
preference in this project's notes: prefer native Zotero dialogs over
toolkit-built ones. The upstream fix is still worth making, since the next
person will reach for the same two helpers.
