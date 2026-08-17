# UI elements reference

`src/modules/mindmap/uiElements.ts` holds the two bits of DOM building the mindmap UI does everywhere: a button whose text comes from Fluent, and a dropdown over the library's mindmaps.

Neither function creates the element it appends into, and neither picks a namespace of its own. The mindmap tab builds its controls in the XHTML namespace because it renders into a XUL document, while the item-pane surfaces use plain `createElement`; hard-coding a namespace here would silently change what one of them produces.

## `appendL10nButton`

```ts
export function appendL10nButton(
  parent: HTMLElement,
  localeId: FluentMessageId,
  onClick?: () => void,
): HTMLButtonElement;
```

Creates a `<button>` through `parent.ownerDocument.createElement("button")`, sets `data-l10n-id` to `getLocaleID(localeId)`, registers `onClick` as a `click` listener when one is given, appends the button to `parent`, and returns it.

`localeId` is a key from the generated `FluentMessageId` union in `typings/i10n.d.ts`; `getLocaleID` prefixes it with the addon's Fluent namespace. See [locale-reference.md](locale-reference.md).

The button has no text content of its own. Fluent fills it in from `data-l10n-id` once the document's localization runs, so a button appended to a document that never had the addon's `.ftl` bundle registered stays blank.

Returns the button so callers can add a class or read it back. The renderer does exactly that: the add-link action in the node context menu gets `NODE_MENU_ADD_LINK_CLASS`, and the dock overview's controls get `SHOW_IN_LIBRARY_CLASS` and `CLOSE_CLASS`. Callers: `graphRenderer.ts` (node menu, grouping menus), `nodeOverview.ts`, `connectionsPanel.ts`, `addLinkForm.ts`.

## `appendMindmapOptions`

```ts
export function appendMindmapOptions(
  select: HTMLSelectElement,
  mindmaps: MindmapSummary[],
): void;
```

Fills `select` with one `<option>` per entry, in the order given.

Each option is created with `createElementNS(select.namespaceURI, "option")`, so it inherits the namespace of the `<select>` it is going into rather than assuming one. `option.value` is the mindmap's `id`, `option.textContent` its `title`, and `option.title` its `description` where there is one, which the browser shows as a tooltip. Options with no description get no `title` attribute at all.

Returns nothing. Appends to `select` without clearing it first; a caller re-rendering a picker has to empty it.

`MindmapSummary` comes from [storage-reference.md](storage-reference.md) and carries `id`, `title`, optional `description`, and `noteItemID`. Callers: `connectionsPanel.ts` (the mindmap picker in the add-node form) and `addLinkForm.ts` (the other-mindmap picker for cross-mindmap links).

## Related

- [rendering-reference.md](rendering-reference.md), the menus built out of `appendL10nButton`
- [locale-reference.md](locale-reference.md), `getLocaleID` and the Fluent message ids
- [storage-reference.md](storage-reference.md), `MindmapSummary` and `listMindmaps`
- [../user-guide/cross-mindmap-links-reference.md](../user-guide/cross-mindmap-links-reference.md), the picker `appendMindmapOptions` fills
