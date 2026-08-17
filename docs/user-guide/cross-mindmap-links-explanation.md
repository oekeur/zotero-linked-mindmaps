# Why external nodes exist

## The problem they solve

Mindmaps are separate on purpose. A reading list, a chapter argument and a methods survey are different views of the same library, and forcing them into one graph is the thing multiple mindmaps exist to avoid.

Separation stops being useful the moment two of them touch. The paper the methods survey turns on is the same paper the chapter argument cites, and there needs to be a way to say so without dragging one mindmap's membership into the other. Moving the node would change what the other mindmap contains. Copying it would create a second node for the same item, and every mechanism that finds a node by its Zotero reference would then find two.

An external node is the third option: a node on this mindmap that openly stands for a node on another one. It carries the Zotero reference so the graph can draw and label it without opening the other document, plus the pair (home mindmap id, home node id) recording where it really belongs.

## Why a separate node kind rather than a flag

Membership is what the distinction is about, and code has to branch on it in several places, not one. A borrowed node is not offered when another mindmap goes looking for something to borrow, because borrowings are not a mindmap's to lend on. A borrowed node is not a target for reconciliation's "does this still exist" question, because only member nodes count as real. And a borrowed node is exactly what reconciliation deletes when its home is gone, which is never true of a member node.

Making it a variant of the node type rather than a boolean means the extra fields come with it: an external node has a home mindmap id and a home node id, and a member node cannot have them. There is no state where a node claims to be borrowed and has nowhere to be borrowed from.

The visual treatment follows the same logic. The dashed border and paler fill say "not really from here" without spending the shape channel, which is reserved for a possible future item-versus-note distinction, and without relying on a color difference alone.

## Why the link lives on one side only

Nothing is written into the mindmap being referenced. The link and the stub both live in the mindmap that authored them, which is what makes that mindmap the link's owner.

The alternative would be a reverse index: a record on the other side saying "mindmap X points at my node Y". That is a second copy of the same fact, held in a second document, and keeping two documents in step is the exact problem the storage design exists to avoid. Two mindmaps are two separate Zotero notes, which sync independently and can be edited on two machines at once. A write that has to land in both, atomically, has no way to be atomic.

The price is that the referenced mindmap has no idea it is being referenced. Open it and nothing hints that another graph reaches into it. That is a real gap, and the honest tradeoff for never having two documents that can disagree.

## What pruneDanglingExternalNodes cleans up

With no reverse index, a stub can outlive what it points at. Two things cause that, and neither can notify the stub's mindmap: the other mindmap is deleted, or the node is removed from it.

Rather than tracking removals, the cleanup reconciles. It reads every mindmap in the library, builds the set of (mindmap, node) pairs that still exist counting member nodes only, and drops every external stub whose pair is not in that set, along with every link touching one. One mechanism covers both causes, and it cannot be left holding stale bookkeeping of its own, because it keeps none.

Deletion notifications from Zotero are part of why it works this way. When a mindmap's storage note is deleted, the notification carries a key, and the document that key named is already gone by the time the observer runs, so there is nothing to look up. Reconciling against what still exists sidesteps needing to identify what was removed.

The pass recomputes which stubs are dangling against the document as it stands at write time, not against the copy it read a moment earlier, since the Connections panel can have changed it in between. A mindmap with nothing to drop is not written at all, so a routine pass costs reads and no writes.

## When it runs, and what that misses

Two triggers: after removing a node through the Connections panel, and after Zotero reports an item deletion the plugin already cleans up for, which is what covers a deleted mindmap.

Nothing runs it on opening a mindmap, on a timer, or after a sync. So a stub whose home node was removed on another machine stays on the graph until something local triggers a pass, and until then it is drawn like any other external node, with no indication that it points at nothing. Its links draw normally too.

This is a known gap rather than a hidden one. The failure mode is a node that looks fine and is stale, not a crash or lost data, and the next local removal or deletion clears it. Adding an on-open pass would trade that for a read of every mindmap in the library on every tab open.
