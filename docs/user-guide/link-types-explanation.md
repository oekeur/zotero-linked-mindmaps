# Why link types work the way they do

## The vocabulary is yours to edit

The five defaults (cites, supports, contradicts, primary source for, related to) come out of citation and argument analysis. They fit that kind of reading well and fit almost nothing else. A lab notebook wants "replicates" and "fails to replicate". A legal reading wants "overrules" and "distinguishes". A course reader wants "assigned for week 3". Ship any list as the complete set and it would be wrong for most users by their second day.

So treat the defaults as a starting point. The preference pane adds, renames and removes freely, and the defaults are only what a profile sees before it has edited anything. That has a consequence worth knowing: a profile that has never touched the list will pick up later revisions of the defaults, while a profile that has edited it never will. The first edit takes ownership of the whole list.

An open vocabulary costs you validation, because there isn't any. Two types called "cites" can happily coexist. Nothing warns you about near-duplicates like "supports" and "supported by", which would be better modelled as a single directional type. Keeping the list coherent falls to you.

The free-text Name on each link exists for the same reason, approached from the other side. Some distinctions recur often enough to belong in the vocabulary. Others apply to exactly one pair of items and would only clutter a dropdown. The type tells you what kind of relation this is; the name tells you which one.

## Types are identified by id, labels are just display

Links store a type's id and never its label. That is what makes renaming safe: change "cites" to "citeert" and every link that used it follows along, with no migration pass over every mindmap document. It also frees the label to be long and readable, since nothing anywhere depends on parsing it.

The price is that identity becomes invisible in the interface. Two types can share a label and still be different types. A type you delete and recreate under the same label is, to every link that referenced the old one, a stranger.

## Deleting a type leaves the links alone

The alternatives would be to delete the links that use the type, or to rewrite them to some fallback. Both destroy authored work in response to what was only a vocabulary edit. Someone tidying up a dropdown does not expect to lose relationships they recorded months ago, and a link's real content (which two items, which direction, what name) survives the loss of its type perfectly well.

So a delete removes the type and stops there. The links keep pointing at an id that no longer resolves, and every surface that draws them handles the miss instead of throwing. The graph labels the edge "(unknown type)" and draws it as a grey dotted line, distinct from both the dashed directional style and the solid non-directional one. The Connections panel prints the same label. The link stays visible, stays selectable, and stays removable.

One label, used everywhere. The delete confirmation promises the user those links "will show as (unknown type)", so a surface that printed the raw type id instead would be quietly breaking a promise made seconds earlier. The label lives with the type vocabulary and both surfaces read it from there.

The confirmation dialog also reports how many links will end up in that state, counted across every mindmap in every library, precisely because the consequence is otherwise invisible. If a mindmap can't be read, the count can't be trusted, so the dialog says as much instead of quietly reporting zero. Calling a type unused when a corrupt note might be full of its links would mean deleting it with no warning at all.

What deletion does not offer is a way back. Recreate the type and it gets a fresh id, so the orphaned links stay orphaned. If you have simply gone off a type name, rename it. Deleting is the move you can't undo.

## Why type is a label and a line style

Color is the obvious way to encode a category, and it fails on this data for two reasons.

An open vocabulary has no upper bound. Categorical color scales run out of distinguishable hues somewhere around eight or ten, so a user who adds a dozen types would end up with colors that differ just enough to confuse. A text label has no such ceiling. It stays exact at any vocabulary size, and since it is what the user typed, it needs no legend.

Color alone also excludes people. Red versus green is not a distinction every reader can make, and a graph where the only difference between "supports" and "contradicts" is hue is unreadable for them. Dash pattern and arrowhead shape carry the directional distinction independently of color, and the label carries the type itself.

The tradeoff is visual noise, and it is a real one. Every edge carries text, so a dense graph gets busy in a way a color-coded one wouldn't, and labels can overlap where edges are short. That is accepted: a tidy graph you can't read is worse than a crowded one you can, and you can always space the nodes further apart, since the positions are yours to set (see [node-layout-explanation.md](node-layout-explanation.md)).
