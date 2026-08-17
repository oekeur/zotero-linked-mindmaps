# Zotero_Tabs.add types `data` as optional, but omitting it crashes Zotero

**Repo:** `windingwind/zotero-types`
**Location:** `types/zoteroTabs.d.ts:34-42`
**Evidence:** crash observed in this project; both sides source-confirmed at HEAD
**Severity:** the type system endorses a call that crashes inside Zotero's own code

## The type

```ts
add: (options: {
  id?: string;
  type: string;
  title: string;
  data?: any;
  index?: number;
  select?: boolean;
  onClose?: Function;
}) => {
  id: string;
  container: XUL.Box;
};
```

`data?: any` says a plugin may omit it. Following that, the plugin crashes.

## What Zotero actually does

`chrome/content/zotero/tabs.js:636` destructures the options and stores `data`
unchanged:

```js
this.add = function ({ id, type, data, title, index, select, onClose, preventJumpback }) {
  if (typeof type != 'string') {
  }
  if (title && typeof title != 'string') {
    throw new Error(`'title' should be string or undefined (was ${typeof title})`);
  }
  ...
  var tab = { id, type, title, data, onClose };
  index = index || this._tabs.length;
  this._tabs.splice(index, 0, tab);
  this._update();
```

`_update()` then reads through `tab.data` without a guard:

```js
// line 342
if (!tab.data.itemID) continue;
// line 377
tab.data.icon = iconName;
// line 380
else if (!tab.data.icon) {
```

So omitting `data` produces `TypeError: can't access property "icon", tab.data
is undefined`, thrown from `chrome://zotero/content/tabs.js`, not from plugin
code. The stack points at Zotero, which is where the debugging time goes.

Note the contrast within `add()` itself: `title`, `index` and `onClose` are all
type-checked with thrown errors, and `data`, the one field whose absence
actually breaks rendering, is not checked at all.

## The fix on the types side

```ts
data: object;
```

`any` was already too loose; the field is read for `itemID` and `icon`, so a
narrower shape would be more useful still, but making it required is the part
that matters. `data: Record<string, unknown>` also works if `object` is too
blunt for the repo's conventions.

## What this project does about it

`src/modules/mindmap/mindmapTab.ts:507` passes `data: {}` explicitly:

```ts
const { id, container } = Zotero_Tabs.add({
  type: TAB_TYPE,
  title: getString("mindmap-tab-title"),
  data: {},
  select: true,
  onClose: () => { ... },
});
```

The plugin never populates it. It is there only to stop Zotero crashing, which
is exactly the kind of knowledge that should live in a type signature instead of
in a comment or a memory file.

## Related

`zotero-tabs-add-missing-data-validation` covers the Zotero-side half: `add()`
could default `data` to `{}` and remove the crash class entirely. The two fixes
are independent and both worth making. The types fix is smaller and lands
sooner; the Zotero fix helps plugin authors who are not using TypeScript at all.
