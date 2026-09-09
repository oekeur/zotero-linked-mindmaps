# Walking the user journeys

The manual half of the verification protocol, written down. `scripts/verify.sh`
covers build, lint and whether the plugin initialized; the Mocha suite covers the
data model, link CRUD and the parts of the UI that survive being mounted in
isolation. What neither covers is a sequence: create a mindmap, put items on it,
link them, drag a node, close the tab, reopen it, delete the item underneath.
The seams between the storage write queue, the notifier observers and the
renderer's live refresh only misbehave in that order, and
[testing-explanation.md](./testing-explanation.md) is explicit that the live tab
test "catches nothing visual".

So this is a checklist, not a test runner. It names the selector, what you should
see, and the probe that proves it rather than suggesting it. An agent drives it
through the MCP rig; a human drives it by hand and reads the same expectations.

Run the journeys that touch what you changed. Running all seven takes roughly
half an hour and is the right call before a release, not before every commit.

## Before you start

Bring up a dev Zotero for this checkout, seeded and observable.

1. In a worktree, run `~/.claude/scripts/worktree-init.sh` first. Without it this
   checkout shares the one dev profile with every other, and two instances on the
   same profile fail in ways that look like your bug.
2. `npm start` if you are watching the UI, `npm run start:headless` if you are
   not. Headless matters more than it looks: under a bare `xvfb-run` on a Wayland
   session Zotero still paints on the real screen. See `CLAUDE.md`.
3. Seed the library: read `scripts/seed-dev-profile.js` and pass its contents to
   `zotero_execute_js`, or paste it into Tools → Developer → Run JavaScript with
   "async" ticked. It reports what it created. Re-running is safe.
4. Note which MCP client answers for this checkout. It is keyed by the
   `ZOTERO_MCP_RDP_PORT` in your `.env`: `zotero-dev-6106` for the main checkout,
   6107 upward for worktrees. The bare `zotero-dev` entry is zoteroTimeline's and
   will answer confidently about the wrong Zotero. Confirm with `zotero_ping`.
5. `zotero_clear_logs`, so the error reads below start from a clean slate.

The fixture gives you six journal articles, one book, a standalone note, a child
note on "Attention Mechanisms in Sparse Graphs", and one link attachment on
"Citation Networks as Reading Aids" — all in a **Mindmap Journeys** collection.
Journeys refer to items by short name: _Attention_, _Citations_, _Layout_,
_Notes_, _Tags_, _Trails_, _Structure_ (the book).

## The rule that makes this worth doing

After every journey, run `zotero_read_errors`. A step whose UI looked right and
whose error log gained an entry is a **failed step**. Most failures in this
codebase have been silent rather than thrown, and the whole reason to write the
journeys down is to catch the ones that never reach the screen.

`zotero_read_errors` keeps only the last 25 entries, so read after each journey
rather than saving it all for the end.

---

## J1 · First run: create a mindmap and put items on it

Covers the empty state, the sidebar form, the item-pane section, the library
context menu, and the container item that all storage hangs off. If the container
is not created correctly nothing else in this document works, so run this one
first after any storage change.

1. **Do** Tools → Mindmap.
   **Expect** a new tab titled "Mindmap". `#zoterolinkedmindmaps-mindmap-sidebar`
   exists, and `#zoterolinkedmindmaps-mindmap-empty-state` reads "No mindmaps
   yet. Create one to start linking items." — not a Fluent id.
   **Probe** `zotero_get_dom_tree` rooted at the sidebar.

2. **Do** Click the sidebar's new-mindmap control (`#zoterolinkedmindmaps-mindmap-new`,
   tooltip "New mindmap"). Fill `#zoterolinkedmindmaps-mindmap-title-input` with
   `Reading trails` and `#zoterolinkedmindmaps-mindmap-description-input` with
   `journey fixture`. Click `#zoterolinkedmindmaps-mindmap-save`.
   **Expect** the form closes, a `.mindmap-sidebar-row` appears carrying that
   title and description, and it is selected. The empty state is gone.
   **Probe** `zotero_get_dom_tree`; then `zotero_db_query` for the storage note:
   `SELECT itemID FROM itemTags JOIN tags USING (tagID) WHERE tags.name = '_zoterolinkedmindmaps-storage-v1'`
   should return exactly one row.

3. **Do** In the library, select _Attention_, _Citations_ and _Layout_.
   Right-click → **Add to Mindmap** → _Reading trails_.
   **Expect** a progress popup reading "Added 3 items to Reading trails". Three
   nodes appear on the graph, spread rather than piled at the origin.
   **Probe** node count and positions through Cytoscape:
   `document.getElementById("zoterolinkedmindmaps-mindmap-container")._cyreg.cy.nodes().map(n => [n.id(), n.position()])`
   via `zotero_execute_js`. Three distinct positions, none of them `{x:0,y:0}`.

4. **Do** Select _Attention_ in the library and open the item pane.
   **Expect** a **Mindmaps** section. It names "Reading trails" after the
   "Mindmap:" label, shows "No links yet. Add one to link this to another item.",
   and offers a remove control titled "Remove from mindmap".
   **Probe** `zotero_screenshot`, and confirm the section is
   `zotero-linked-mindmaps-connections` in the DOM tree.

5. **Do** Select the link attachment "Preprint (link)" under _Citations_.
   **Expect** no Mindmaps section, or an empty one. An attachment is not a
   mindmap node.

6. **Do** Look at the library root for an item named "Zotero Linked Mindmaps
   (plugin data)".
   **Expect** with the default preference it is hidden. This is the container;
   J7 turns the preference off and checks it reappears.

**Then** `zotero_read_errors`.

---

## J2 · Link two items, and see the edge

Covers the add-link dialog, the target picker, direction and naming, the item
pane's link rows, and the edge the renderer draws for them. The dialog is the
single densest surface in the plugin and it renders in its own window, which is
where `ztoolkit.Dialog`'s traps live.

1. **Do** With _Attention_ selected, click the Mindmaps section's header button
   (tooltip "Add link").
   **Expect** a window titled "Add link". Its context line reads `Linking
"Attention Mechanisms in Sparse Graphs" in "Reading trails"`. The target shows
   "Nothing chosen yet" and Save is disabled with the tooltip "Choose a target
   first".
   **Probe** `zotero_list_windows` to confirm a second window exists; screenshot
   it.

2. **Do** Click "Choose target…" and pick _Citations_.
   **Expect** the target field fills with the item's title and Save enables.

3. **Do** Set Type to a directional type. Read the Direction labels.
   **Expect** both options name the type inline: `This item <type> the target`
   and `The target <type> this item`. A type marked undirected in preferences
   offers no direction control at all.

4. **Do** Give the link a Name, then Save.
   **Expect** the window closes. The item pane grows a `.mindmap-link-row`
   showing the type, the name, an arrow reflecting the direction, and the target
   title. The graph draws an edge between the two nodes.
   **Probe** `...._cyreg.cy.edges().map(e => [e.data("id"), e.source().id(), e.target().id()])`.

5. **Do** Try to link _Attention_ to itself.
   **Expect** the refusal "An item can't be linked to itself." Nothing is saved.

6. **Do** Try to choose the "Preprint (link)" attachment as a target.
   **Expect** "Only items and notes can be linked. Attachments can't."

7. **Do** Open the legend (`.mindmap-legend-toggle-button`).
   **Expect** rows for directional link, undirected link, unknown type,
   parent-child tie, external node, group, and group-membership dots. Every row
   has a drawn sample, not just a label.
   **Probe** screenshot — this is a visual contract and the DOM tree will not
   tell you a sample failed to paint.

8. **Do** Add _Notes_ to the mindmap, then add the child note "Margin note on
   Rivera" too.
   **Expect** a parent-child tie draws between the note and _Attention_ with the
   legend's tie styling, distinct from a typed link.

9. **Do** Click a node on the graph.
   **Expect** the docked panel (`#zoterolinkedmindmaps-mindmap-connections-dock`)
   fills with that node's item: a `.mindmap-node-overview` carrying the title and,
   below it, the same Connections content the item pane shows. Clicking a
   different node replaces it rather than appending.
   **Probe** screenshot. Check the note node too — a note's label is a preview of
   its content, not its title, and the dock and the graph should agree.

10. **Do** Click "Show in library" (`.mindmap-show-in-library`).
    **Expect** the item becomes the selection in the library pane. This is the
    only control that navigates away from the graph; clicking a node never does.

11. **Do** Click the dock's close control (`.mindmap-dock-close`, title "Close").
    **Expect** the dock hides. Clicking another node brings it back with that
    node's content, not with what it held before.

**Then** `zotero_read_errors`.

---

## J3 · Layout: drag, persist, reopen, re-layout

Covers the one thing headless tests provably cannot check. Layout output depends
on the container's measured size, and a synthetic container spreads nodes
plausibly while a real 0-by-0 one piles them at the origin.

1. **Do** Drag a node somewhere distinctive.
   **Expect** it stays where dropped.
   **Probe** read the node's position from Cytoscape, then read it back out of
   storage and confirm they agree:
   `zotero_db_query` the storage note's content, or re-open the mindmap and
   compare. Cytoscape agreeing with itself proves nothing.

2. **Do** Close the tab and reopen it via Tools → Mindmap, then select "Reading
   trails".
   **Expect** every node is where you left it. The dragged node especially.

3. **Do** Add _Tags_ to the mindmap while the tab is open.
   **Expect** the node appears without a manual refresh, placed near the others
   rather than at the origin — that is the unplaced-node layout path.

4. **Do** Click zoom out, zoom in, then fit (`.mindmap-zoom-out-button`,
   `.mindmap-zoom-in-button`, `.mindmap-fit-button`).
   **Expect** the graph scales and then frames every node.
   **Probe** `cy.zoom()` before and after.

5. **Do** With nothing selected, click re-layout (`.mindmap-relayout-button`).
   **Expect** a confirm titled "Re-layout nodes" whose body is the every-node
   wording. Cancel it; nothing moves.

6. **Do** Select two nodes, click re-layout, confirm.
   **Expect** the confirm names the count ("the 2 selected nodes"). Only those
   two move; every other node holds its position.
   **Probe** positions before and after for a node you did not select.

**Then** `zotero_read_errors`.

---

## J4 · Groups

Covers the overlay region, multi-group membership, and the group controls in both
the library context menu and the item pane. Group regions are drawn as an overlay
rather than as compound nodes, so they are pure paint: only a screenshot tells
you whether one rendered.

1. **Do** Select _Attention_, _Citations_ and _Layout_. Right-click → **Group
   Items on Mindmap…** → _Reading trails_. Name it `Method`.
   **Expect** "Grouped 3 items on Reading trails". A region is drawn behind those
   three nodes, labelled "Method".
   **Probe** screenshot. Confirm the region does not fill with `--color-accent`;
   `project/ui-design.md` forbids it for regions.

2. **Do** Select _Layout_, _Tags_ and the "Preprint (link)" attachment. Group
   them as `Layout work`.
   **Expect** the skipped message: "1 item was left out: only items and notes can
   be grouped." _Layout_ is now in two groups, and carries two membership dots.
   **Probe** screenshot for the dots; confirm both regions draw and overlap
   without one erasing the other.

3. **Do** Select a node in a group. Rename the group, then ungroup it.
   **Expect** the label updates; ungrouping removes the region but leaves every
   node in place.

4. **Do** In the item pane for _Layout_, use "Remove from group".
   **Expect** the button names the group where it has one ("Remove from
   \"Method\""). Removing from one group leaves the other membership intact and
   drops one dot.

**Then** `zotero_read_errors`.

---

## J5 · External nodes across mindmaps

Covers the cross-mindmap path: a node that lives on one mindmap appearing on
another, and what happens to it when its home is deleted. This is a whole module
(`crossMindmapCleanup.ts`) with no manual coverage otherwise.

1. **Do** Create a second mindmap, `Side reading`. Add _Trails_ and _Structure_
   to it.
   **Expect** the sidebar lists two mindmaps; switching between them swaps the
   graph.

2. **Do** On _Side reading_, open the add-link dialog for _Trails_ and use "Link
   to another mindmap…".
   **Expect** the other mindmap is offered. With only one mindmap in the library
   this control instead reads "No other mindmaps yet."

3. **Do** Link _Trails_ to a node from _Reading trails_.
   **Expect** an external node appears on _Side reading_, styled per the legend's
   "Node from another mindmap" row and visibly distinct from a member node.
   **Probe** screenshot, plus the node's data in Cytoscape.

4. **Do** Delete _Reading trails_ (sidebar delete control).
   **Expect** a confirm naming the title and warning that links and layout go
   with it, and stating the items themselves stay in the library. Confirm it.
   **Expect** on _Side reading_, the external node and its link are gone rather
   than left dangling.
   **Probe** `zotero_read_errors` immediately — cleanup runs from a notifier
   observer, which is exactly where an unawaited write queue surfaces.

**Then** re-seed by recreating _Reading trails_ if you plan to run J6.

---

## J6 · Deletion and recovery

Covers what happens when Zotero data disappears underneath the plugin. Every step
here is a path where the plugin is reacting to someone else's event, not handling
its own click.

1. **Do** With the tab open on a mindmap, move _Attention_ to the trash from the
   library.
   **Expect** the node stays on the graph, still labelled. Trashing is not
   deleting: `deletionCleanup.ts` filters to the notifier's `delete` event, and a
   trashed item still resolves through `Zotero.Items.getByLibraryAndKey`. A node
   vanishing here is the bug, not the expected result.

2. **Do** Restore it from the trash.
   **Expect** nothing changes on the graph, because nothing changed when it was
   trashed.

3. **Do** Trash _Attention_ again, then empty the trash (or right-click →
   Delete Permanently).
   **Expect** now the node and every link touching it leave the open graph
   without a manual refresh, and stay gone after closing and reopening the tab.
   **Probe** `zotero_read_errors` straight away. Cleanup runs from a notifier
   observer, and an observer that awaits the storage write queue deadlocks
   silently rather than throwing.

4. **Do** Turn off the hide preference (J7 step 1), find the storage note, and
   trash it.
   **Expect** the warning "A mindmap's data note was moved to the trash. That
   mindmap stays hidden until you restore it." The mindmap leaves the sidebar
   rather than rendering empty.

5. **Do** Restore the note.
   **Expect** the mindmap returns intact, links and layout included.

6. **Do** Trash the container item "Zotero Linked Mindmaps (plugin data)".
   **Expect** "The Zotero Linked Mindmaps item was moved to the trash. Every
   mindmap in that library stays hidden until you restore it." Every mindmap
   disappears, and no new container is created behind your back.

7. **Do** Restart Zotero with the container still trashed.
   **Expect** the startup variant of the same warning.

8. **Do** Restore the container.
   **Expect** every mindmap returns.

**Then** `zotero_read_errors`.

---

## J7 · Preferences and link types

Covers the preferences pane, the link-type editor, and the one preference with a
visible effect on Zotero's own library view.

1. **Do** Open Zotero preferences → **Mindmaps**. Untick "Hide the Zotero Linked
   Mindmaps item from my library".
   **Expect** the container item appears in the library list immediately, without
   a restart. Tick it again and it goes.
   **Probe** this is the monkey-patched `Zotero.CollectionTreeRow` path, which has
   no stable seam to assert against. Screenshot both states.

2. **Do** Add a link type. Give it a label and mark it directional.
   **Expect** it appears in the table with "Directional" in that column, and is
   offered as a Type in the add-link dialog next time you open it.

3. **Do** Edit an existing type's label.
   **Expect** links already using it show the new label in the item pane and on
   the graph, since links store the type id rather than its label.

4. **Do** Delete a type that links are using.
   **Expect** a confirm naming the count: "Delete this link type? 2 links use it
   and will show as \"(unknown type)\" there." Confirm.
   **Expect** those links now render with the legend's unknown-type styling and
   read "(unknown type)" in the item pane. They are not deleted.

5. **Do** Open the Feedback section and click "Report a bug…".
   **Expect** a GitHub form opens in the browser, prefilled with plugin version,
   Zotero version, OS and recent errors. **Read what is prefilled before
   submitting anything.** Do not paste the result anywhere: this project's
   `getSystemInfo()` output embeds the full installed-plugin list.

**Then** `zotero_read_errors`.

---

## What this does not cover

Group libraries. `cross-library-refused` ("A mindmap belongs to one library")
needs a second library, and a group library needs a synced Zotero account. The
seeder cannot make one and neither can the dev profile.

Sync conflicts. Two devices writing the same storage note is a known accepted
risk recorded in `project/PRODUCT.md`, not something a single profile can stage.

The dock's missing-item state. `showNodeInDock` falls back to "(missing item)"
when a node's ref no longer resolves, but staging that by hand is awkward: a
trashed item still resolves, and a permanently deleted one gets its node pruned
by `deletionCleanup.ts` before you can click it. The state is reachable in
practice from a document written on another device, which a single dev profile
cannot produce. `graphRenderer.test.ts:437` covers it instead.

Anything already asserted by the Mocha suite. Storage semantics, link CRUD,
validation and the schema's back-compat paths are covered there, and a second,
slower, hand-driven copy of those assertions would cost maintenance and catch
nothing.

## Keeping this true

Selectors and strings drift. Element ids live in `src/modules/mindmap/*.ts` as
module constants and the user-visible strings in `addon/locale/en-US/*.ftl`; a
rename in either makes a step here wrong. `scripts/doc-drift.sh` ranks this file
against the modules it describes, but its score is a queue rather than a verdict:
what actually goes stale is a renamed id or a reworded string, and only walking
the journey finds that.
