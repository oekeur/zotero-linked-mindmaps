# Why link types work the way they do

## A vocabulary you own, not a fixed set

The five defaults (cites, supports, contradicts, primary source for, related to) come from citation and argument analysis. They fit that kind of reading and fit almost nothing else. A lab notebook wants "replicates" and "fails to replicate". A legal reading wants "overrules" and "distinguishes". A course reader wants "assigned for week 3". Any list shipped as the complete set would be wrong for most users on the second day.

So the defaults are a starting point rather than a schema. The pane adds, renames and removes freely, and the defaults are only what a profile sees before it edits anything. Note the consequence: a profile that has never touched the list picks up later revisions of the defaults, and a profile that has edited it never does. Editing takes ownership of the whole list.

The cost of an open vocabulary is that nothing validates it. Two types called "cites" can coexist, and nothing warns about near-duplicates like "supports" and "supported by" that would be better modelled as one directional type. Keeping the list coherent is the user's job.

A separate free text Name on each link exists for the same reason from the other side. Some distinctions belong in the vocabulary because they recur; some are specific to one pair of items and would only clutter a dropdown. The type answers "what kind of relation is this", the name answers "which one, exactly".

## Types are identified by id, labels are just display

Links store a type's id and never its label. That is what makes renaming safe: change "cites" to "citeert" and every link that used it follows, without a migration pass over every mindmap document. It also means the label is free to be long and readable, since nothing depends on parsing it.

The price is that identity is invisible in the interface. Two types can share a label and be different types, and a type deleted and recreated under the same label is a different type to every link that referenced the old one.

## Deleting a type leaves the links alone

The alternative would be to delete the links that use the type, or to rewrite them to some fallback type. Both destroy authored work in response to a vocabulary edit. Someone tidying up a dropdown does not expect to lose relationships they recorded months earlier, and a link's real content (which two items, which direction, what name) survives its type perfectly well.

So a delete removes the type and nothing else. The links keep pointing at an id that now resolves to nothing, and every surface that draws them handles the miss rather than throwing: the graph labels the edge "(unknown type)" and draws it as a grey dotted line, distinct from both the dashed directional style and the solid non-directional one, and the Connections panel prints the same label. The link stays visible, stays selectable, and stays removable.

One label, not one per surface. The delete confirmation tells the user those links "will show as (unknown type)", so a surface that printed the raw type id instead would be quietly breaking a promise the dialog made a moment earlier. The label lives with the type vocabulary and both surfaces read it from there.

The confirmation dialog reports how many links will end up in that state, counted across every mindmap in every library, precisely because the consequence is invisible otherwise. When a mindmap cannot be read the count cannot be trusted, so the dialog says so instead of reporting zero. Reporting a type as unused when a corrupt note might be full of its links would delete it with no warning at all.

What deletion does not offer is a way back. Recreating the type gives it a fresh id, so the orphaned links stay orphaned. Renaming a type you no longer like is the non-destructive move; deleting one is not.

## Type is a label plus a line style, not a color

Color is the obvious way to encode a category, and it fails on this data for two reasons.

An open vocabulary has no upper bound. Categorical color scales run out of distinguishable hues somewhere around eight to ten, and a user who adds a dozen types would get colors that only differ enough to be confusing. A text label has no such ceiling: it is exact at any vocabulary size, and it is what the user typed, so it needs no legend.

Color alone also excludes: red versus green is not a distinction every reader can make, and a graph where the only difference between "supports" and "contradicts" is hue is unreadable for them. Dash pattern and arrowhead shape carry the directional distinction independently of color, and the label carries the type itself.

The tradeoff is visual noise. Every edge carries text, so a dense graph gets busy in a way a color-coded one would not, and labels can overlap where edges are short. That is accepted: an unreadable-but-tidy graph is worse than a legible crowded one, and spacing nodes further apart is under the user's control since positions are theirs to set (see [node-layout-explanation.md](node-layout-explanation.md)).
