**Title:** `Zotero_Tabs.add` types `data` as optional, but omitting it throws inside Zotero's tab rendering

### Summary

`types/zoteroTabs.d.ts:38` declares `data?: any` on `Zotero_Tabs.add`. Omitting
it type-checks and then crashes: Zotero's `_update()` dereferences `tab.data`
without a guard, so a plugin registering a custom tab gets

```
TypeError: can't access property "icon", tab.data is undefined
```

thrown from `chrome://zotero/content/tabs.js`, with no plugin frame in the stack.

### Evidence

Zotero's `add()` (`chrome/content/zotero/tabs.js:636`) stores `data` as passed
and never defaults it:

```js
this.add = function ({ id, type, data, title, index, select, onClose, preventJumpback }) {
  if (typeof type != 'string') {
  }
  if (title && typeof title != 'string') {
    throw new Error(`'title' should be string or undefined (was ${typeof title})`);
  }
  ...
  var tab = { id, type, title, data, onClose };
  this._tabs.splice(index, 0, tab);
  this._update();
```

`_update()` then reads it unconditionally:

```js
342:  if (!tab.data.itemID) continue;
377:      tab.data.icon = iconName;
380:  else if (!tab.data.icon) {
```

For a custom plugin tab there is no `itemID`, so execution reaches line 380 and
throws.

Note that `title`, `index` and `onClose` are all validated with thrown errors in
the same function; `data` is the one field whose absence actually breaks
rendering, and it is unchecked.

### Suggested change

```diff
-      data?: any;
+      data: object;
```

`Record<string, unknown>` is fine too if that suits the repo's conventions
better. The important part is dropping the `?`.

### Impact

Our plugin passes `data: {}` at its only `Zotero_Tabs.add` call site and never
reads that object. It exists purely to satisfy a requirement the types deny. A
plugin author trusting the signature loses a debugging cycle to a stack trace
that points at Zotero's code rather than their own.

### Environment

`zotero-types` 4.1.0-beta.4 and `HEAD` as of 2026-08-17; `zotero/zotero@HEAD`
for the runtime side.
