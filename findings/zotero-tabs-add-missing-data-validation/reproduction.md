# Reproduction

## Runtime, from a plugin

In a Zotero 7 plugin, register a custom tab without `data`:

```js
const { id, container } = Zotero_Tabs.add({
  type: "myplugin-tab",
  title: "My Tab",
  select: true,
});
```

Observed:

```
TypeError: can't access property "icon", tab.data is undefined
```

thrown from `chrome://zotero/content/tabs.js` inside `_update()`, during the
`add()` call. No tab appears. There is no plugin frame in the stack, so the
apparent culprit is Zotero.

Adding `data: {}` and changing nothing else makes it work.

Observed in this project during the mindmap tab work; quoted here rather than
re-run, since it needs a live Zotero and a deliberately broken call. The source
evidence below was verified directly today and shows the same thing.

## Source, at zotero/zotero HEAD

`add()` checks three options and not the fourth:

```
$ gh api repos/zotero/zotero/contents/chrome/content/zotero/tabs.js \
    -H "Accept: application/vnd.github.raw" | grep -n -A 22 "this.add = function"
636:	this.add = function ({ id, type, data, title, index, select, onClose, preventJumpback }) {
637:		if (typeof type != 'string') {
638:		}
639:		if (title && typeof title != 'string') {
640:			throw new Error(`'title' should be string or undefined (was ${typeof title})`);
641:		}
642:		if (!title) {
643:			title = "";
644:		}
645:		if (index !== undefined && (!Number.isInteger(index) || index < 1)) {
646:			throw new Error(`'index' should be an integer > 0 (was ${index} (${typeof index})`);
647:		}
648:		if (onClose !== undefined && typeof onClose != 'function') {
649:			throw new Error(`'onClose' should be a function (was ${typeof onClose})`);
650:		}
651:		id = id || 'tab-' + Zotero.Utilities.randomString();
652:		var container = document.createXULElement('tab-content');
653:		container.id = id;
654:		this.deck.appendChild(container);
655:		var tab = { id, type, title, data, onClose };
656:		index = index || this._tabs.length;
657:		this._tabs.splice(index, 0, tab);
658:		this._update();
```

Note line 637-638: an `if` with an empty body checking the one field that is
genuinely required.

`_update()` dereferences `tab.data` in three places:

```
$ ... | grep -n "tab.data" | head
342:			if (!tab.data.itemID) continue;
377:					tab.data.icon = iconName;
380:			else if (!tab.data.icon) {
```

Line 380 is the one a plugin tab reaches, since a custom tab has no `itemID`.

## State left behind

Lines 652-657 run before `_update()`, so at the moment of the throw:

- a `tab-content` element has been appended to the deck
- the tab object is already in `this._tabs`

The exception therefore leaves a partially registered tab rather than failing
cleanly, which is the argument for handling `data` at the top of the function
alongside the other checks.

## Contrast with the working call

From this project, `src/modules/mindmap/mindmapTab.ts:507`:

```ts
const { id, container } = Zotero_Tabs.add({
  type: TAB_TYPE,
  title: getString("mindmap-tab-title"),
  data: {},
  select: true,
  onClose: () => { ... },
});
```

The plugin never reads that object. It is there only because omitting it crashes.
