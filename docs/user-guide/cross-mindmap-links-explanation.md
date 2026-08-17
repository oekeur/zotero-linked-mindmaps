# Why external nodes exist

## The problem they solve

Mindmaps are separate on purpose. A reading list, a chapter argument and a methods survey are different views of the same library, and forcing them into one graph is precisely what multiple mindmaps exist to avoid.

That separation stops being useful the moment two of them touch. The paper the methods survey turns on is the same paper the chapter argument cites, and you need a way to say so without dragging one mindmap's membership into the other. Moving the node would change what the other mindmap contains. Copying it would create a second node for the same item, and then every mechanism that finds a node by its Zotero reference would find two of them.

An external node is the third option: a node on this mindmap that openly stands in for a node on another one. It carries the Zotero reference, so the graph can draw and label it without opening the other document, plus the pair (home mindmap id, home node id) recording where it really belongs.

## Why a separate node kind instead of a flag

The distinction is about membership, and code has to branch on it in several places rather than one. A borrowed node doesn't get offered when another mindmap goes looking for something to borrow, because borrowings aren't a mindmap's to lend on. It isn't a target for reconciliation's "does this still exist" question either, since only member nodes count as real. And a borrowed node is exactly what reconciliation deletes once its home is gone, which is never true of a member node.

Membership is also why borrowing has to exclude the item you are linking from. A stub and a member node are separate nodes, so nothing in the data model breaks if both stand for the same Zotero item. That is the problem: the graph would draw one paper as two circles with a link between them, and every mechanism that finds a node by its Zotero reference would find two, which is the duplication external nodes exist to prevent. So the node dropdown leaves it out, and the save rejects it if the other mindmap changes under an open form.

Making it a variant of the node type instead of a boolean brings the extra fields along with it. An external node has a home mindmap id and a home node id; a member node can't have them. There is no state where a node claims to be borrowed and has nowhere to be borrowed from.

The visual treatment follows the same logic. A dashed border and paler fill say "not really from here" without spending the shape channel, which is being held back for a possible future item-versus-note distinction, and without leaning on color alone.

## Why the link lives on one side only

Nothing gets written into the mindmap being referenced. The link and the stub both live in the mindmap that authored them, and that is what makes that mindmap the link's owner.

The alternative would be a reverse index: a record on the other side saying "mindmap X points at my node Y". That is a second copy of the same fact, held in a second document, and keeping two documents in step is exactly the problem the storage design exists to avoid. Two mindmaps are two separate Zotero notes. They sync independently and can be edited on two machines at once, so a write that has to land in both, atomically, has no way to be atomic.

The price is that the referenced mindmap has no idea it is being referenced. Open it and nothing hints that another graph reaches into it. That is a real gap, and it is the honest cost of never having two documents that can disagree.

## What pruneDanglingExternalNodes cleans up

With no reverse index, a stub can outlive what it points at. Two things cause that, and neither one can notify the stub's mindmap: the other mindmap gets deleted, or the node gets removed from it.

So instead of tracking removals, the cleanup reconciles. It reads every mindmap in the library, builds the set of (mindmap, node) pairs that still exist counting member nodes only, then drops every external stub whose pair isn't in that set, along with every link touching one. One mechanism covers both causes, and it can't end up holding stale bookkeeping of its own, because it keeps none.

Zotero's deletion notifications are part of why it works this way. When a mindmap's storage note is deleted the notification carries a key, and the document that key named is already gone by the time the observer runs, so there is nothing left to look up. Reconciling against what still exists sidesteps having to identify what was removed.

The pass recomputes which stubs are dangling against the document as it stands at write time, not against the copy it read a moment earlier, because the Connections panel may have changed it in between. A mindmap with nothing to drop never gets written, so a routine pass costs reads and no writes.

## When it runs, and what that misses

There are two triggers: after you remove a node through the Connections panel, and after Zotero reports an item deletion the plugin already cleans up for, which is what covers a deleted mindmap.

Nothing runs it on opening a mindmap, on a timer, or after a sync. So a stub whose home node was removed on another machine will sit on your graph until something local triggers a pass, and until then it draws like any other external node, with nothing to indicate it points at nothing. Its links draw normally too.

This is a known gap rather than a hidden one. What you get is a node that looks fine and is stale, not a crash or lost data, and the next local removal or deletion clears it. Adding an on-open pass would trade that for a read of every mindmap in the library on every single tab open.
