# Zotero_Tabs.add validates every option except the one that crashes when absent

**Repo:** `zotero/zotero`
**Location:** `chrome/content/zotero/tabs.js:636-658`, with the crash at 377-380
**Evidence:** source-confirmed at HEAD; crash observed in this project
**Severity:** a plugin gets a TypeError from Zotero's own code with no plugin frame in the stack

## What the code does

```js
this.add = function ({ id, type, data, title, index, select, onClose, preventJumpback }) {
  if (typeof type != 'string') {
  }
  if (title && typeof title != 'string') {
    throw new Error(`'title' should be string or undefined (was ${typeof title})`);
  }
  if (!title) {
    title = "";
  }
  if (index !== undefined && (!Number.isInteger(index) || index < 1)) {
    throw new Error(`'index' should be an integer > 0 (was ${index} (${typeof index})`);
  }
  if (onClose !== undefined && typeof onClose != 'function') {
    throw new Error(`'onClose' should be a function (was ${typeof onClose})`);
  }
  id = id || 'tab-' + Zotero.Utilities.randomString();
  var container = document.createXULElement('tab-content');
  container.id = id;
  this.deck.appendChild(container);
  var tab = { id, type, title, data, onClose };
  index = index || this._tabs.length;
  this._tabs.splice(index, 0, tab);
  this._update();
```

`title`, `index` and `onClose` are all checked, and `title` even gets a default.
`data` is passed through untouched, and `_update()` reads it without a guard:

```js
// line 342
if (!tab.data.itemID) continue;
// line 377
tab.data.icon = iconName;
// line 380
else if (!tab.data.icon) {
```

Calling `add()` without `data` therefore throws
`TypeError: can't access property "icon", tab.data is undefined` from inside
`_update()`, during `add()`. The tab does not appear.

The tab has already been pushed into `this._tabs` by then
(`this._tabs.splice(index, 0, tab)` precedes `_update()`), so the throw leaves a
half-registered tab in the array and an orphan `tab-content` element in the deck.
That is worse than a validation error at the top of the function.

## Two one-line options

Default it, matching the treatment `title` gets three lines above:

```js
if (!data) {
  data = {};
}
```

Or validate it, matching `index` and `onClose`:

```js
if (data !== undefined && typeof data != "object") {
  throw new Error(`'data' should be an object (was ${typeof data})`);
}
```

Defaulting is better here. Every internal caller passes a real `data` object, so
nothing depends on the absent case, and defaulting removes the crash rather than
relocating it. Validation alone would still reject a plugin call that Zotero could
trivially satisfy itself.

## Bonus: an empty if-block two lines up

```js
if (typeof type != "string") {
}
```

`type` is the one genuinely required field, and its check has an empty body. It
reads like a `throw` that was removed or never written. Since `type` is what
plugin tab registration keys on, a plugin passing the wrong thing gets no error
here either.

Worth fixing in the same change, or at least reporting, since it is the same
class of gap in the same function.

## Relationship to the types finding

`types-zotero-tabs-data-not-optional` covers the `zotero-types` side, where
`data?: any` tells TypeScript users the field is optional. That fix helps people
using types; this one helps everyone, including plugin authors writing plain
JavaScript. Independent, both worth making.
