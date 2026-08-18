# Why the graph looks and refreshes the way it does

The renderer draws a stored document. It never decides where anything goes. Positions come out of the document, the Cytoscape layout is always `preset`, and the only code that computes coordinates is [`layoutUnplacedNodes`](layout-reference.md), which runs for nodes that don't have any yet. That split is the product decision sitting behind everything else on this page: the arrangement belongs to the user, and a render must not disturb it.

For the symbol-level details, see [rendering-reference.md](rendering-reference.md).

## Link type is a label plus a line style

Color is the obvious first choice for "which kind of link is this", and it runs out fast. Past roughly eight to ten types, two swatches stop being tellable apart at edge width, and a viewer who can't separate red from green never had them apart to begin with. The link vocabulary is user-editable and unbounded ([link types](../user-guide/link-types-reference.md) live in prefs, and users add their own), so a channel with a small ceiling is the wrong one to carry the primary meaning.

Every edge therefore carries its type name as text, drawn along the line with `text-rotation: autorotate` and an opaque white background so it stays readable over whatever it crosses. The label answers "what kind of link is this". The line style is a second, coarser cue on top: dashed with a triangle arrowhead for a directional type, solid and arrowless for an undirectional one. Two states is what a style channel can carry without ambiguity, and they encode the one property that changes how you should read the edge, rather than trying to say which of N types it is.

A link's freeform `name` is appended to the type label as `"cites: see p.12"` instead of replacing it, so a named link still tells you what kind it is.

The third style, dotted grey, is the fallback for a link whose `typeId` matches nothing in the current vocabulary. A user can delete a type from settings while links still reference it, and the renderer has three options: drop the link, throw, or draw it as something. Dropping loses data the user still has. Throwing takes the whole graph down over one edge. So the link renders with the label `(unknown type)` and the dotted style, which makes it visibly wrong and still leaves it there to be repaired.

All of this leaves color free, which is on purpose. It stays available for something else later. Shape is deliberately unspent too, since shape is how a future item-versus-note distinction would read. That is why an external node borrowed from another mindmap gets a dashed border and a paler fill at the same shape and size, rather than a different outline shape. See [why external nodes exist](../user-guide/cross-mindmap-links-explanation.md).

## Parallel links are offset so each stays readable

Two links between the same pair of nodes trace the same bezier, land on top of each other, and stack their labels into an unreadable mess. `computeParallelOffsets` fans them apart before the elements get built.

The grouping key is the unordered node pair: `[sourceNodeId, targetNodeId]` sorted and joined. Direction is left out because a link from A to B overlaps a link from B to A exactly as much as it overlaps another A-to-B link. Each group's links then get sorted by id and assigned `40 * (i - (n - 1) / 2)`, which spreads them symmetrically around the straight line. One link gets 0 and draws exactly as it would have; two get -20 and +20; three get -40, 0 and +40. The value goes into edge data as `parallelOffset`, and the stylesheet feeds it to `control-point-distances` at weight 0.5, so each edge bows out at its midpoint, which is where its own label sits.

Sorting by link id instead of by array order is what makes a rebuild reproduce the same arrangement. Live refresh destroys and rebuilds the whole graph on every relevant write, and an ordering that depended on how the links happened to come out of the document would reshuffle the fan on every unrelated edit.

Self-links are the honest gap here. A link whose source and target are the same node lands alone in its own pair group and gets offset 0, and Cytoscape draws it as a loop edge, which ignores `control-point-distances` entirely. Two self-links on the same node would still overlap. Nothing special-cases that yet.

## Parent-child ties are not links

Zotero already knows that a note belongs to an item. When both are on the mindmap, drawing nothing between them makes the graph contradict the library. Drawing a link between them would be worse. It would claim someone authored a relationship that nobody did, it would need a type from a vocabulary about scholarly relations, and it would sit in `doc.links` where deletion, editing and the Mindmaps section would all have to cope with a link the user can't meaningfully change.

So ties are a separate element kind, with a deliberately weaker presence. They get recomputed on every render from `item.parentItemID` and never written to the document, so there is no persisted state to go stale. Add the parent to the mindmap and the tie appears. Remove it and the tie is gone. Reparent the note in Zotero and the next render follows along. Their ids are prefixed `tie:` so nothing can confuse one with a link id when selecting or styling.

Visually they are a dotted line at width 1 in a very light grey, lighter than the dotted grey of an unknown-type edge so the two don't read alike, and they carry no label. That last part is load-bearing, and the test asserts it: every real edge carries a label, including the unknown-type fallback, so an unlabelled line can never be mistaken for an authored relationship. A tie that happens to run between the same two nodes as a real link is drawn underneath it, since ties are appended after links in the element list and later elements paint on top.

A child note whose parent isn't on the mindmap gets no tie. There is nothing to connect it to, and inventing a placeholder node for the parent would put something on the graph the user never asked for.

## Live refresh, and the three things it guards against

The graph has to answer edits made elsewhere: a link added from the Mindmaps section in the item pane, a node pruned by deletion cleanup, a group created in another window. `attachLiveRefresh` registers a Zotero notifier observer, filters for a `modify` on the storage note's own item id, and rebuilds.

The rebuild is a full destroy-and-recreate, not an in-place diff. For v1's expected corpus (dozens to low hundreds of nodes) recreating is fast enough, and it has no reconciliation logic to get wrong. That is a deliberate simplicity choice with a known ceiling, not a shortcut waiting to be tidied up.

Three failure modes shaped the rest of it.

**Rebuilding for your own write.** Dragging a node moves it on screen, then saves it, and that save fires the same notification any other edit does. A naive observer would tear down the Cytoscape instance the gesture was just using and rebuild an identical graph, flashing on every drag. The guard is `RenderedState`. The renderer records the serialized document it drew, the drag write records the serialized document it is about to save (before the write resolves, because the first notification for that save arrives first), and the observer compares the freshly read document against it and returns when they match.

Comparing content instead of setting a "currently writing" flag is what makes this work, because Zotero fires two modify notifications per save: one inside the transaction and a second a macrotask later, after any flag would already have been cleared. Identity catches both and needs no assumption about when a notification arrives. The state box is per rendered graph, not per module, so two open tabs over the same mindmap don't suppress each other's refreshes. The tests cover exactly that pair of cases.

**Deadlocking the storage queue.** The observer's `notify` returns `void` and has to keep returning `void`. Zotero awaits every observer's return value inside the DB transaction commit that fired the notification, and the write that modified the storage note runs as a task on the storage queue. An observer that awaited its own rebuild would park that rebuild behind the very task waiting for the observer to return, and the queue would stay wedged for the rest of the session with every later save hanging silently. So the rebuild is started and deliberately not awaited. See [notifier-queue-explanation.md](notifier-queue-explanation.md).

**Losing a notification that lands mid-rebuild.** A rebuild awaits several times over: the note read, the render, the layout. Dropping notifications that arrive in that window isn't free, because one of them might be a prune from deletion cleanup, and the graph would go on showing a node that no longer exists until the tab is reopened. So a rebuild in flight sets a dirty flag, and the scheduler loops until no notification arrived during the last pass.

Two smaller decisions round it out. The rebuild reads the note by the item id it was opened with instead of looking a mindmap up again, because an id-less lookup in a library with several mindmaps resolves to whichever sorts first. And it calls `refreshNote` before reading, because this runs on a notification about a write that landed a moment ago, which is exactly when Zotero's item cache lags.

## Grouping does not move anything

A group is drawn as a Cytoscape compound node with its members pointing at it as their parent. Cytoscape sizes a compound node to fit its children, so the region is derived from where the members already are. Nothing gets repositioned, which is what keeps grouping from fighting the persisted layout. The container is given no position of its own (under a preset layout that would override the auto-fit) and is not grabbable (dragging it would carry every member along and rewrite coordinates the user set deliberately). A group with no members is skipped instead of being drawn as an empty region.

The grouping and add-link menus are DOM popups drawn into the graph container rather than native XUL context menus, for the same reason the node dock is a panel: a DOM popup doesn't block, and it can hold an inline text field for renaming. That choice comes with one piece of required plumbing, a `mousedown` stopPropagation on the menu. Without it, Cytoscape treats a click on the menu as a click on its own canvas and removes the menu on `mouseup`, before the button's `click` ever fires.

## Related

- [rendering-reference.md](rendering-reference.md)
- [../user-guide/link-types-explanation.md](../user-guide/link-types-explanation.md), the vocabulary these visuals encode
- [../user-guide/node-layout-explanation.md](../user-guide/node-layout-explanation.md), why positions are persisted rather than recomputed
- [cytoscape-explanation.md](cytoscape-explanation.md), what running Cytoscape inside Zotero costs
- [notifier-queue-explanation.md](notifier-queue-explanation.md), the observer and storage-queue interaction
