# Reproduction

## Runtime crash, observed in this project

Registering a custom main-window tab without `data`:

```ts
const { id, container } = Zotero_Tabs.add({
  type: "myplugin-tab",
  title: "My Tab",
  select: true,
});
```

`tsc --noEmit` passes, because `data?: any` marks the field optional. At runtime
Zotero throws:

```
TypeError: can't access property "icon", tab.data is undefined
```

from `chrome://zotero/content/tabs.js`, inside `_update()`, during the `add()`
call. The tab does not appear. Adding `data: {}` makes it work with no other
change, which isolates the cause to that field alone.

This is quoted from the earlier session in this project that hit it, not re-run
here, since it needs a live Zotero and a deliberately broken build. The two
source-side facts below were verified directly and are what a fix needs.

## Type side, at zotero-types HEAD

```
$ gh api repos/windingwind/zotero-types/contents/types/zoteroTabs.d.ts \
    -H "Accept: application/vnd.github.raw" | sed -n '34,42p'
    add: (options: {
      id?: string;
      type: string;
      title: string;
      data?: any;
      index?: number;
      select?: boolean;
      onClose?: Function;
    }) => { id: string; container: XUL.Box };
```

Same in the installed 4.1.0-beta.4.

## Zotero side, at zotero/zotero HEAD

`add()` accepts `data` without validating or defaulting it:

```
$ gh api repos/zotero/zotero/contents/chrome/content/zotero/tabs.js \
    -H "Accept: application/vnd.github.raw" | grep -n -A 22 "this.add = function"
636:	this.add = function ({ id, type, data, title, index, select, onClose, preventJumpback }) {
637:		if (typeof type != 'string') {
638:		}
639:		if (title && typeof title != 'string') {
640:			throw new Error(`'title' should be string or undefined (was ${typeof title})`);
641:		}
...
655:		var tab = { id, type, title, data, onClose };
656:		index = index || this._tabs.length;
657:		this._tabs.splice(index, 0, tab);
658:		this._update();
```

And `_update()` dereferences it unconditionally:

```
$ ... | grep -n "tab.data"
342:			if (!tab.data.itemID) continue;
377:					tab.data.icon = iconName;
380:			else if (!tab.data.icon) {
```

Line 380 is the one that throws for a plugin tab, since a custom tab has no
`itemID` and the code reaches the `icon` check.

Worth noting that `title`, `index` and `onClose` are all validated with thrown
errors in the same function, while `data` is not, so the runtime contract and the
declared contract disagree in the one place it matters.

## Working call for comparison

`src/modules/mindmap/mindmapTab.ts:507` in this repo:

```ts
const { id, container } = Zotero_Tabs.add({
  type: TAB_TYPE,
  title: getString("mindmap-tab-title"),
  data: {},
  select: true,
  onClose: () => { ... },
});
```

The plugin never reads or writes that object. It exists solely to satisfy an
undeclared requirement.
