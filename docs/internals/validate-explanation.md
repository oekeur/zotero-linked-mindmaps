# Why the plugin distrusts its own data

`src/modules/mindmap/validate.ts` checks every field of every document read back from storage, even though the plugin is the only thing that ever writes one. For what the checks are, see [validate-reference.md](validate-reference.md).

## The document is not the object you wrote

Between `writeMindmapDocument` and the next read, the document leaves the plugin's hands entirely. It becomes HTML inside a Zotero note item, and that note is a first-class, user-editable, synced piece of library data. Four things can happen to it in there, and three of them already have.

Zotero re-serializes note content through its own note schema after a save, without the user opening anything. Attributes the schema doesn't recognise get dropped, including the `id` on the plugin's `<pre>` block, which is why the reader had to be loosened to match any `<pre>`. Zotero's editor is free to make other changes the plugin hasn't run into yet.

The user can open the note. Nothing stops them. It appears in the library (behind a container item and a filter, but still there), it opens in the note editor like any other note, and the warning paragraph the plugin writes at the top is the only thing asking them not to. An edit that breaks the JSON is one keystroke away.

The note syncs, and sync is where a version mismatch arrives. A machine running plugin version 2 writes a version 2 document, and a machine still on version 1 reads it. Sync also truncates and conflicts: Zotero resolves note conflicts by picking a side rather than merging, so what lands can be an entire earlier revision (see [storage-explanation.md](storage-explanation.md)).

And the plugin's own writes have been wrong before now. A `NaN` position nested inside `{x, y}` serialized to `{"x": null, "y": null}`, which is neither a valid `Position` nor the `null` marker, and it made the note it was written into unreadable. The validator caught that. Nothing else would have.

So "the plugin wrote it" tells you nothing about what comes back. The read path treats the parsed JSON as input from outside, because by the time it arrives, that is what it is.

## What the parser does with what it cannot trust

It refuses the whole document. `parseMindmapDocument` returns `{ok: false, error}` on the first failed check and never returns a partial document. No repair, no field defaulting, no dropping bad nodes to salvage the good ones.

That is the right call for the same reason the schema carries a version. A partially-read document is a document that will be written back, and writing back a document with the fields the reader didn't understand stripped out destroys them permanently in a synced store. You can recover from a refusal to read. You cannot recover from reading badly and then saving.

The refusal is graded by caller rather than by the parser. `readDocumentFromNote` throws a `StorageError` with reason `invalid-schema`, so a call site that needs one specific mindmap fails loudly. `readAllMindmaps` catches that, logs the note id through `logFailure`, and skips it, so one corrupt note doesn't make the rest of the library's mindmaps unlistable. Nothing writes to a note that failed to parse, which is what leaves the door open to recovering the data by hand or with a later plugin version.

There is a gap in that arrangement, and it is a real one: the skip only reaches `Zotero.getErrors()`, not the interface. A user whose mindmap stops appearing in the list gets no message telling them why, and no pointer at the note that broke, unless they know to check Help -> Report Errors.

## What the parser deliberately does not check

Type shape only. Referential integrity is out of scope. A link naming a node id that doesn't exist validates. A `groupId` naming a missing group validates. An external node whose home mindmap was deleted validates.

Two reasons for that. Those states are legitimately reachable in normal operation rather than being corruption: the whole point of [cross-mindmap cleanup](cross-mindmap-cleanup-explanation.md) is that a stub can outlive its target, and rejecting the document would turn a recoverable inconsistency into an unreadable mindmap. The checks would also need the rest of the library in hand, which would turn a synchronous pure function into an async one that opens other notes on every read.

Emptiness isn't checked either. A blank title passes the parser, and the non-blank rule lives in `storage.ts`, alongside the user-facing operations that could produce one. The parser answers whether the JSON is a document, not whether it is a good one.

## Why hand-rolled guards instead of a schema library

The shape is small and flat: three record types, one union with two variants, one document wrapper. Validation runs once per note open and never on a hot path. A schema library would add a dependency, a bundle, and a second description of a schema that already exists as TypeScript types, in exchange for error messages about as good as the ones here.

Hand-rolling costs you the guarantee that the guards and the types in `schema.ts` agree, since they are two independent statements of the same shape and nothing forces them together. Add a field to `MindmapDocument` without touching `parseMindmapDocument` and it compiles cleanly, then silently strips that field on every read, because the parser rebuilds the top-level document key by key and copies only the keys it knows about. Node, link and group objects get passed through as-is, so an unknown field on those survives a read but never gets validated. Whoever edits `schema.ts` has to edit `validate.ts` in the same pass.
