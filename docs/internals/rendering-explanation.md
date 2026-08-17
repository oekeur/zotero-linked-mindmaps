# Why the graph looks and refreshes the way it does

The renderer draws a stored document; it never decides where anything goes. Positions come out of the document, the Cytoscape layout is always `preset`, and the only code that computes coordinates is [`layoutUnplacedNodes`](layout-reference.md), which runs for nodes that have none yet. That split is the product decision behind everything else on this page: the arrangement belongs to the user, and a render must not disturb it.

For the symbol-level details, see [rendering-reference.md](rendering-reference.md).

## Link type is a label plus a line style, not a color

Color is the obvious first choice for "which kind of link is this", and it runs out fast. Past roughly eight to ten types, two swatches stop being tellable apart at edge width, and a viewer who cannot separate red from green never had them apart in the first place. The link vocabulary is user-editable and unbounded ([link types](../user-guide/link-types-reference.md) live in prefs, and users add their own), so a channel with a small ceiling is the wrong channel to carry the primary meaning.

Every edge therefore carries its type name as text, drawn along the line with `text-rotation: autorotate` and an opaque white background so it stays readable over whatever it crosses. The label is the answer to "what kind of link is this". The line style is a second, coarser cue on top of it: dashed with a triangle arrowhead for a directional type, solid and arrowless for an undirectional one. Two states, which is what a style channel can carry without ambiguity, and they encode the one property that changes how the edge should be read rather than which of N types it is.

A link's freeform `name` is appended to the type label as `"cites: see p.12"` rather than replacing it, so a named link still says what kind it is.

The third style, dotted grey, is the fallback for a link whose `typeId` matches nothing in the current vocabulary. A user can delete a type from settings while links still reference it, and there are three things the renderer could do: drop the link, throw, or draw it as something. Dropping loses data the user still has; throwing takes the whole graph down over one edge. So the link renders with the label `(unknown type)` and the dotted style. The link is visibly wrong, and it is still there to be repaired.

Color is left free by all of this, which is on purpose. It is available later for something else, and shape is deliberately unspent too: shape is how a future item-versus-note distinction would read, which is why an external node borrowed from another mindmap gets a dashed border and a paler fill at the same shape and size rather than a different outline shape. See [cross-mindmap-links-explanation.md](cross-mindmap-links-explanation.md).

## Parallel links are offset so each stays readable

Two links between the same pair of nodes trace the same bezier, land on top of each other, and stack their labels into an unreadable overlap. `computeParallelOffsets` fans them apart before the elements are built.

The grouping key is the unordered node pair: `[sourceNodeId, targetNodeId]` sorted and joined. Direction is left out because a link from A to B overlaps a link from B to A exactly as much as it overlaps another A-to-B link. Each group's links are then sorted by id and assigned `40 * (i - (n - 1) / 2)`, which spreads them symmetrically around the straight line: one link gets 0 and draws exactly as it would have, two get -20 and +20, three get -40, 0 and +40. The value goes into edge data as `parallelOffset` and the stylesheet feeds it to `control-point-distances` at weight 0.5, so each edge bows out at its midpoint, where its own label sits.

Sorting by link id rather than by array order is what makes a rebuild reproduce the arrangement. Live refresh destroys and rebuilds the whole graph on every relevant write, and an ordering that depended on how the links happened to come out of the document would reshuffle the fan on every unrelated edit.

Self-links are the honest gap. A link whose source and target are the same node lands alone in its own pair group and gets offset 0, and Cytoscape draws it as a loop edge, which does not respond to `control-point-distances` at all. Two self-links on the same node would still overlap. Nothing special-cases that yet.

## Parent-child ties are not links

Zotero already knows that a note belongs to an item. When both are on the mindmap, drawing nothing between them makes the graph contradict the library. Drawing a link between them would be worse: it would claim someone authored a relationship that nobody did, it would need a type from a vocabulary about scholarly relations, and it would sit in `doc.links` where deletion, editing and the Connections panel would all have to handle a link the user cannot meaningfully change.

So ties are a separate element kind with a deliberately weaker presence. They are recomputed on every render from `item.parentItemID` and never written to the document, which means there is no persisted state to go stale: add the parent to the mindmap and the tie appears, remove it and the tie is gone, reparent the note in Zotero and the next render follows. Their ids are prefixed `tie:` so nothing can confuse one with a link id when selecting or styling.

Visually they are a dotted line at width 1 in a very light grey, lighter than the dotted grey of an unknown-type edge so the two do not read alike, and they carry no label. That last part is the load-bearing one, and the test asserts it: every real edge carries a label, including the unknown-type fallback, so an unlabelled line cannot be mistaken for an authored relationship. A tie that happens to run between the same two nodes as a real link is drawn underneath it, because ties are appended after links in the element list and later elements paint on top.

A child note whose parent is not on the mindmap gets no tie. There is nothing to connect it to, and inventing a placeholder node for the parent would add something to the graph the user did not put there.

## Live refresh, and the three things it guards against

The graph has to answer edits made elsewhere: a link added from the Connections panel in the item pane, a node pruned by deletion cleanup, a group created in another window. `attachLiveRefresh` registers a Zotero notifier observer, filters for a `modify` on the storage note's own item id, and rebuilds.

The rebuild is a full destroy-and-recreate rather than an in-place diff. For v1's expected corpus (dozens to low hundreds of nodes) recreating is fast enough and has no reconciliation logic to get wrong. That is a deliberate simplicity choice with a known ceiling, not a shortcut waiting to be tidied.

Three failure modes shaped the rest of it.

**Rebuilding for your own write.** Dragging a node moves it on screen, then saves it, and the save fires the same notification any other edit does. A naive observer would tear down the Cytoscape instance the gesture was just using and rebuild an identical graph, flashing on every drag. The guard is `RenderedState`: the renderer records the serialized document it drew, the drag write records the serialized document it is about to save (before the write resolves, because the first notification for that save arrives first), and the observer compares the freshly read document against it and returns when they match.

Comparing content rather than setting a "currently writing" flag is what makes this work, because Zotero fires two modify notifications per save: one inside the transaction and a second a macrotask later, after any flag would have been cleared. Identity catches both and needs no assumption about when a notification arrives. The state box is per rendered graph, not per module, so two open tabs over the same mindmap do not suppress each other's refreshes; the tests cover exactly that pair of cases.

**Deadlocking the storage queue.** The observer's `notify` returns `void` and must keep returning `void`. Zotero awaits every observer's return value inside the DB transaction commit that fired the notification, and the write that modified the storage note runs as a task on the storage queue. An observer that awaited its own rebuild would park that rebuild behind the very task waiting for the observer to return, and the queue would stay wedged for the rest of the session with every later save hanging silently. The rebuild is started and deliberately not awaited. See [notifier-queue-explanation.md](notifier-queue-explanation.md).

**Losing a notification that lands mid-rebuild.** A rebuild awaits several times over: the note read, the render, the layout. Dropping notifications that arrive in that window is not free, because one of them may be a prune from deletion cleanup, and the graph would keep showing a node that no longer exists until the tab is reopened. Instead a rebuild in flight sets a dirty flag, and the scheduler loops until no notification arrived during the last pass.

Two smaller decisions round it out. The rebuild reads the note by the item id it was opened with rather than looking a mindmap up again, because an id-less lookup in a library with several mindmaps resolves to whichever sorts first. And it calls `refreshNote` before reading, because this runs on a notification about a write that landed a moment ago, which is exactly when Zotero's item cache lags.

## Grouping does not move anything

A group is drawn as a Cytoscape compound node with its members pointing at it as their parent. Cytoscape sizes a compound node to fit its children, so the region is derived from where the members already are. Nothing is repositioned, which is what keeps grouping from fighting the persisted layout. The container is given no position of its own (under a preset layout that would override the auto-fit) and is not grabbable (dragging it would carry every member along and rewrite coordinates the user set deliberately). A group with no members is skipped rather than drawn as an empty region.

The grouping and add-link menus are DOM popups drawn into the graph container rather than native XUL context menus, for the same reason the Connections dock is a panel: a DOM popup does not block, and it can hold an inline text field for renaming. That choice comes with one piece of required plumbing, a `mousedown` stopPropagation on the menu, without which Cytoscape treats a click on the menu as a click on its own canvas and removes the menu on `mouseup`, before the button's `click` ever fires.

## Related

- [rendering-reference.md](rendering-reference.md)
- [../user-guide/link-types-explanation.md](../user-guide/link-types-explanation.md), the vocabulary these visuals encode
- [../user-guide/node-layout-explanation.md](../user-guide/node-layout-explanation.md), why positions are persisted rather than recomputed
- [cytoscape-explanation.md](cytoscape-explanation.md), what running Cytoscape inside Zotero costs
- [notifier-queue-explanation.md](notifier-queue-explanation.md), the observer and storage-queue interaction
