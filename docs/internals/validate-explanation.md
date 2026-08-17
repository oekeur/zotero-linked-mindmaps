# Why the plugin distrusts its own data

`src/modules/mindmap/validate.ts` checks every field of every document read back from storage, even though the plugin is the only thing that ever writes one. For what the checks are, see [validate-reference.md](validate-reference.md).

## The document is not the object you wrote

Between `writeMindmapDocument` and the next read, the document leaves the plugin's hands entirely. It becomes HTML inside a Zotero note item, and that note is a first-class, user-editable, synced piece of library data. Four things can happen to it there, and three of them have happened.

Zotero re-serializes note content through its own note schema after a save, without the user opening anything. Attributes the schema does not recognise are dropped, including the `id` on the plugin's `<pre>` block. The reader had to be loosened to match any `<pre>` because of it. Zotero's editor is free to make other changes the plugin has not seen yet.

The user can open the note. Nothing stops them: it appears in the library (behind a container item and a filter, but still there), it opens in the note editor like any other note, and the warning paragraph the plugin writes at the top of it is the only thing asking them not to. An edit that breaks the JSON is one keystroke.

The note syncs, and sync is where a version mismatch arrives. A machine running plugin version 2 writes a version 2 document; a machine still on version 1 reads it. Sync also truncates and conflicts: Zotero resolves note conflicts by picking a side, not merging, so the document that lands can be a whole earlier revision (see [storage-explanation.md](storage-explanation.md)).

And the plugin's own writes have been wrong before. A `NaN` position nested inside `{x, y}` serialized to `{"x": null, "y": null}`, which is neither a valid `Position` nor the `null` marker, and made the note it was written into unreadable. The validator caught it. Nothing else would have.

So "the plugin wrote it" says nothing about what comes back. The read path treats the parsed JSON as input from outside, because by the time it arrives that is what it is.

## What the parser does with what it cannot trust

It refuses the whole document. `parseMindmapDocument` returns `{ok: false, error}` on the first failed check and never returns a partial document; there is no repair, no field defaulting, no dropping of bad nodes to salvage the good ones.

That is the right call for the same reason the schema carries a version. A partially-read document is a document that will be written back, and writing back a document with the fields the reader did not understand removed destroys them permanently in a synced store. Refusing to read is recoverable. Reading badly and then saving is not.

The refusal is graded by caller rather than by the parser. `readDocumentFromNote` throws a `StorageError` with reason `invalid-schema`, so a call site that needs one specific mindmap fails loudly. `readAllMindmaps` catches that, logs the note id through `Zotero.debug`, and skips it, so one corrupt note does not make the rest of the library's mindmaps unlistable. Nothing writes to a note that failed to parse, which is what leaves the door open for the data to be recovered by hand or by a later plugin version.

The gap in that arrangement: the skip is a debug line. A user whose mindmap stops appearing in the list gets no message telling them why, and no pointer at the note that broke. That is a real hole, not a design choice.

## What the parser deliberately does not check

Type shape only. Referential integrity is out of scope: a link naming a node id that does not exist validates, a `groupId` naming a missing group validates, an external node whose home mindmap was deleted validates.

Two reasons. Those states are legitimately reachable in normal operation, not corruption: the whole point of [cross-mindmap cleanup](cross-mindmap-cleanup-explanation.md) is that a stub can outlive its target, and rejecting the document would take a recoverable inconsistency and make the mindmap unreadable. And the checks would need the rest of the library in hand, which would turn a synchronous pure function into an async one that opens other notes on every read.

Emptiness is also not checked. A blank title passes the parser; the non-blank rule lives in `storage.ts`, where the user-facing operations that could produce one are. The parser is about whether the JSON is a document, not about whether it is a good one.

## Why hand-rolled guards rather than a schema library

The shape is small and flat: three record types, one union with two variants, one document wrapper. Validation runs once per note open, not on any hot path. A schema library would add a dependency, a bundle, and a second description of a schema that already exists as TypeScript types, in exchange for error messages roughly as good as the ones here.

The cost of hand-rolling is that the guards and the types in `schema.ts` are two independent statements of the same shape, and nothing forces them to agree. Adding a field to `MindmapDocument` without touching `parseMindmapDocument` compiles cleanly and then silently strips that field on every read, because the parser rebuilds the top-level document key by key and copies only the keys it knows. Node, link and group objects are passed through as-is, so an unknown field on those survives a read but is never validated. Whoever edits `schema.ts` has to edit `validate.ts` in the same pass.
