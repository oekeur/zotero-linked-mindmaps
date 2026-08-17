**Title:** `Zotero_Tabs.add()` throws from `_update()` when `data` is omitted, leaving a half-registered tab

### Summary

`Zotero_Tabs.add()` (`chrome/content/zotero/tabs.js:636`) validates `title`,
`index` and `onClose`, and defaults `title`, but passes `data` through
unchecked. `_update()` then dereferences it:

```js
342:  if (!tab.data.itemID) continue;
377:      tab.data.icon = iconName;
380:  else if (!tab.data.icon) {
```

A plugin registering a custom tab without `data` gets

```
TypeError: can't access property "icon", tab.data is undefined
```

thrown from `tabs.js`, with no plugin frame in the stack, so the failure looks
like it belongs to Zotero.

### Reproduction

From a Zotero 7 plugin:

```js
Zotero_Tabs.add({ type: "myplugin-tab", title: "My Tab", select: true });
```

The tab does not appear and the above TypeError is thrown. Adding `data: {}` fixes
it with no other change.

### Why it is worse than a plain validation gap

The container element and the tab object are created before `_update()` runs:

```js
651:  id = id || 'tab-' + Zotero.Utilities.randomString();
652:  var container = document.createXULElement('tab-content');
653:  container.id = id;
654:  this.deck.appendChild(container);
655:  var tab = { id, type, title, data, onClose };
656:  index = index || this._tabs.length;
657:  this._tabs.splice(index, 0, tab);
658:  this._update();
```

So the throw leaves an entry in `this._tabs` and an orphan `tab-content` in the
deck, rather than failing cleanly the way the other option checks do.

### Suggested fix

Default it, in keeping with how `title` is handled three lines above:

```diff
   if (!title) {
     title = "";
   }
+  if (!data) {
+    data = {};
+  }
```

Every internal caller already passes a real object, so nothing depends on the
absent case. Validation instead of a default would also work, but defaulting
removes the failure rather than relocating it.

### Related, same function

```js
637:  if (typeof type != 'string') {
638:  }
```

An empty `if` body checking `type`, which is the one genuinely required field and
the one plugin tab registration keys on. It reads like a `throw` that went
missing. Worth filling in or removing.

### Context

`zotero-types` declares this parameter as `data?: any`, so plugins written in
TypeScript are actively told the field is optional. Reported there separately.
Our plugin passes `data: {}` at its only call site purely to avoid this crash.

### Environment

`zotero/zotero@HEAD` as of 2026-08-17. Observed against Zotero 7 while developing
a plugin with a custom main-window tab.
