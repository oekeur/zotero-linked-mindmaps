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
3. Seed the library. Cheapest way from an agent is to let Zotero read the file
   itself rather than pushing 190 lines through the tool call:

   ```js
   const src = await Zotero.File.getContentsAsync(
     "<abs path>/scripts/seed-dev-profile.js",
   );
   return await eval(src);
   ```

   By hand: Tools → Developer → Run JavaScript, paste, tick "async", Run. It
   reports what it created, and re-running reports `created 0` instead of
   duplicating.

4. Note which MCP client answers for this checkout. It is keyed by the
   `ZOTERO_MCP_RDP_PORT` in your `.env`: `zotero-dev-6106` for the main checkout,
   6107 upward for worktrees. The bare `zotero-dev` entry is zoteroTimeline's and
   will answer confidently about the wrong Zotero. Confirm with `zotero_ping`.
5. `zotero_clear_logs`, so the error reads below start from a clean slate.
6. Check `pgrep -f "zotero-plugin test"` first, and again if your Zotero dies
   for no reason. When any scaffold test run on the machine exits, in this
   project or another, `zotero-plugin-scaffold` 0.8.8 runs `pkill -9 zotero`
   (see `findings/scaffold-kill-zotero-unscoped`), which takes your dev
   instance with it seconds after "Server Ready". Four restarts were lost to
   parallel zoteroTimeline runs on 2026-09-14. Mindmap state survives in the
   profile, so a restart resumes where you were; a run stuck in watch mode
   never reaches the kill and is safe to start alongside.

The fixture gives you six journal articles, one book, a standalone note, a child
note on "Attention Mechanisms in Sparse Graphs", and one link attachment on
"Citation Networks as Reading Aids" — all in a **Mindmap Journeys** collection.
Journeys refer to items by short name: _Attention_, _Citations_, _Layout_,
_Notes_, _Tags_, _Trails_, _Structure_ (the book).

## An item-pane section below the fold reads as empty for a moment

The Mindmaps section draws its content from `onRender`, which Zotero calls for
every selection of an enabled section regardless of scroll position (it used to
draw from `onAsyncRender`, which Zotero skips for any section outside the
scrolled viewport, and a section below the fold then stayed empty until scrolled
to). `onRender` cannot be async, so the read runs detached: read the body in the
same tick as the selection and you get an empty string, which looks exactly like
the plugin failing to render. Wait a moment, or poll the body, before reading.

The dev window is 1000x600 and the section sits near the bottom of the item
pane, around y=1422, so a screenshot still needs `scrollIntoView()` on it:

```js
const sec = Zotero.getMainWindow().document.querySelector(
  "item-pane-custom-section",
);
sec.scrollIntoView();
```

An empty body cost a false bug report during the first walk of J1. The error
console was clean throughout, which is the tell: a section that threw would
have left an entry.

## Driving the rig: eight things that will waste your time

Walking these through `zotero_execute_js` and `zotero_click_element` hits the
same traps every time. All eight were paid for once already.

**Wrap in an async IIFE yourself.** The tool auto-wraps code with a top-level
`return`, but that wrapper failed on at least one script here with "await is only
valid in async functions". `return (async () => { ... })();` always works.

**Object literals do not cross the Xray boundary.** `node.position({x: 640, y: 420})`
from the rig silently does nothing: Cytoscape reads `.x`/`.y` off an object built
in the debugger's compartment and gets undefined. The node is not locked and no
error is raised. Pass primitives instead — `node.position("x", 640)` — which is
how the drag in J3 is staged.

**Scope every section selector.** `toolbarbutton.add.section-custom-button`
matches 12 buttons (one per item-pane section) and `checkbox` matches 15 across
the preference panes. `zotero_click_element` takes index 0 and clicks something
else entirely. Query inside `item-pane-custom-section`, or inside the pane you
mean, and click through `execute_js`.

**The target picker is a blocking modal.** "Choose target…" opens Zotero's own
`selectItemsDialog.xhtml` (window type `zotero:item-selector`), which blocks
`zotero_execute_js` against the main window — the call times out rather than
failing. `zotero_list_windows` still answers. Drive the dialog by `windowId`:
rows are `#item-tree-select-items-dialog-default-row-N` and need
`mouseEvents: true`; accept with `button[dlgtype="accept"]`.

**Native prompts ARE drivable, despite the tool warning.** The group-name prompt
is a `chrome://global/content/commonDialog.xhtml` window (titled "Group items",
377x138). `zotero_click_element`'s note about blocking modals does not apply to
it: type with `zotero_send_keys` into `#loginTextbox` and accept with
`button[dlgtype="accept"]`, both addressed by `windowId`. The window gets a
**fresh id every time** it opens, so re-read `zotero_list_windows` rather than
reusing the last one. Note the group submenu entries carry a trailing ellipsis
("Reading trails…") precisely because they open this prompt, where the
add-to-mindmap entries do not.

**The plugin's preference pane loads lazily.** Nothing matching
`.zoterolinkedmindmaps-type-table` exists in the preferences document until you
navigate to the pane, and `zotero_open_preferences` with the plugin id lands on
General instead. Click
`richlistitem[value="zoterolinkedmindmaps-link-types-pane"]` (labelled
"Mindmaps") in `#prefs-navigation` first. The pane is inlined into the
preferences document, not iframed, so once shown it is queryable directly.

**A `_cyreg.cy` handle dies on the next write.** `attachLiveRefresh` answers
every storage notification by destroying the Cytoscape instance and rendering a
new one. A handle taken before an add, a link save or a group change keeps
answering afterwards, with the old node count, and never throws. Read
`document.getElementById("zoterolinkedmindmaps-mindmap-container")._cyreg.cy`
again after each step that writes; J3 step 3 looked like a live-refresh failure
until the handle was re-read.

**Group rename and ungroup live behind a right-click on the region.** There is
no button for them: `attachGroupingHandlers` listens for Cytoscape's `cxttap` on
the core and hit-tests the position against the group overlay. `cy.emit()` with
an event object built in the debugger compartment fails with
`events.split is not a function`, because Cytoscape's plain-object check does not
recognise it. Dispatch real `MouseEvent`s (`mousedown` then `mouseup`, `button:
2`) on the container's last `<canvas>` at a client position inside the region
but outside the node: model `x` of the node minus 33, converted with
`cy.zoom()` and `cy.pan()`, lands inside a single-node region (radius 40) and
clear of the node (radius 25). The menu is `div.mindmap-group-menu` inside the
container, holding an `<input>` with the current name and the buttons "Rename
group" and "Ungroup".

**The journeys are not independent.** J2 and J3 assume the mindmap tab is open
and a mindmap selected, which is where J1 leaves you; J7's link-type steps assume
links exist, which is where J2 leaves you. Reopening the tab selects the **first**
mindmap in the sidebar, not the one you had. Run J1 first, or select the mindmap
yourself before starting.

## The rule that makes this worth doing

After every journey, run `zotero_read_errors`. A step whose UI looked right and
whose error log gained an entry is a **failed step**. Most failures in this
codebase have been silent rather than thrown, and the whole reason to write the
journeys down is to catch the ones that never reach the screen.

`zotero_read_errors` keeps only the last 25 entries, so read after each journey
rather than saving it all for the end.

---

## J1 · First run: create a mindmap and put items on it

Covers the sidebar form, the item-pane section, the library context menu, and
the container item that all storage hangs off. If the container is not created
correctly nothing else in this document works, so run this one first after any
storage change.

Walked against 10.0-beta.25 on 2026-09-09, and again in full on 2026-09-14 at
`6f88e73` on a fresh worktree profile: every step of all seven journeys, 44 in
total, with no plugin entry in the error console at any point. Every
expectation below is what actually happened, not what the source suggested. The
second walk corrected J4 steps 2-4, rewrote J5 and J6 steps 4-6, and added two
rig traps; nothing it found was a defect in the plugin, though J6 left one open
question in `docs/internals/container-guard-explanation.md`.

1. **Do** Tools → Mindmap.
   **Expect** a new tab titled "Mindmap", with
   `#zoterolinkedmindmaps-mindmap-sidebar`,
   `#zoterolinkedmindmaps-mindmap-container` and
   `#zoterolinkedmindmaps-mindmap-connections-dock` all present. On a library
   with no mindmaps you get **one already made for you**, titled "Mindmap" and
   selected. That is `createDefaultMindmapIfNeeded` (`mindmapTab.ts:503`), and
   with it the container item and one storage note.
   **Not** the empty state. `#zoterolinkedmindmaps-mindmap-empty-state` renders
   only when a refresh finds zero mindmaps, which on this path cannot happen —
   reach it by deleting the last mindmap with the tab open (J6). A checklist
   that expects "No mindmaps yet" here is wrong, and this one did.
   **Probe** `zotero_get_dom_tree` rooted at the sidebar.

2. **Do** Click the sidebar's new-mindmap control (`#zoterolinkedmindmaps-mindmap-new`,
   tooltip "New mindmap"). Fill `#zoterolinkedmindmaps-mindmap-title-input` with
   `Reading trails` and `#zoterolinkedmindmaps-mindmap-description-input` with
   `journey fixture`. Click `#zoterolinkedmindmaps-mindmap-save`.
   **Expect** the form closes and a second `.mindmap-sidebar-row` appears
   carrying that title and description, selected. The default "Mindmap" row stays
   above it — creating a mindmap does not replace the one made in step 1.
   **Probe** `zotero_db_query`:
   `SELECT itemID FROM itemTags JOIN tags USING (tagID) WHERE tags.name = '_zoterolinkedmindmaps-storage-v1'`
   returns **two** rows now, one per mindmap.

3. **Do** In the library, select _Attention_, _Citations_ and _Layout_.
   Right-click → **Add to Mindmap** → _Reading trails_.
   **Expect** a progress popup reading "Added 3 items to Reading trails". Three
   nodes appear on the graph, spread rather than piled at the origin. With two
   mindmaps in the library the menu entry is a submenu listing both by title,
   with the description as its tooltip; the flat `…-add-to-mindmap` menuitem is
   hidden and the `…-add-to-mindmap-submenu` shown.
   **Probe** node count and positions through Cytoscape:
   `document.getElementById("zoterolinkedmindmaps-mindmap-container")._cyreg.cy.nodes().map(n => [n.id(), n.position()])`
   via `zotero_execute_js`. Three distinct positions, none of them `{x:0,y:0}`.

4. **Do** Select _Attention_ in the library and **scroll the Mindmaps section
   into view** (see the async-render note above — skipping this reads as a bug).
   **Expect** a **Mindmaps** section whose body holds a `.mindmap-current-picker`
   reading "Reading trails", the message "No links yet. Add one to link this to
   another item.", and one button titled "Remove from mindmap". The section's
   body text is exactly `Reading trailsNo links yet. …` — the `Mindmap:` label
   from the `.ftl` is not rendered here.
   **Probe** `zotero_screenshot`. In the DOM the section is an
   `item-pane-custom-section` whose `data-pane` is the paneID namespaced by the
   addon id and CSS-escaped
   (`zoterolinkedmindmaps\@oekeur\.github\.io-zotero-linked-mindmaps-connections`),
   not a bare `zotero-linked-mindmaps-connections`.

5. **Do** Select the link attachment "Preprint (link)" under _Citations_.
   **Expect** the section is still in the DOM but `hidden`, computed
   `display: none` — `onItemChange` calls `setEnabled(canBeMindmapNode(item))`
   and an attachment fails that. Its body keeps the previous item's text, so read
   `hidden`, not the text.

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

1. **Do** With _Attention_ selected and the section scrolled into view, click
   the Mindmaps section's header button (`toolbarbutton.add.section-custom-button`
   **inside** `item-pane-custom-section`, tooltip "Add link").
   **Expect** the form opens **inline in the section body**, not in a window.
   `zotero_list_windows` still shows only "My Library - Zotero". The body grows a
   `.mindmap-form-grid` with a Type select (the five default types), a "Name
   (optional)" field, Direction, a Target reading "Nothing chosen yet", and
   buttons "Choose target…", "Link to another mindmap…" and Save. Save is
   disabled with the tooltip "Choose a target first".
   **Note** the separate window titled "Add link", with its `Linking "…" in "…"`
   context line, is the _other_ entry point: the library context menu's "Add
   Link…". Two surfaces over the same form; do not expect a window here.

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

9. **Do** Click a node on the graph. (From the rig: `cy.nodes()[0].emit("tap")`.)
   **Expect** the docked panel (`#zoterolinkedmindmaps-mindmap-connections-dock`)
   fills with that node's item — a `.mindmap-node-overview` carrying the title,
   the item type (`.mindmap-node-overview-type`, e.g. "Journal Article"), creator
   and year, a "Show in library" control, and below it the same Connections
   content the item pane shows, link rows included. Clicking a different node
   replaces the content rather than appending.
   **Probe** screenshot. Check the note node too — a note's label is a preview of
   its content, not its title, and the dock and the graph should agree.

10. **Do** Click "Show in library" (`.mindmap-show-in-library`).
    **Expect** Zotero switches to the library tab (`Zotero_Tabs.selectedID`
    becomes `zotero-pane`) and selects that item. This is the only control that
    navigates away from the graph; clicking a node never does.

11. **Do** Click the dock's close control (`.mindmap-dock-close`, title "Close").
    **Expect** the dock hides. Clicking another node brings it back with that
    node's content, not with what it held before.

**Then** `zotero_read_errors`.

---

## J3 · Layout: drag, persist, reopen, re-layout

Covers the one thing headless tests provably cannot check. Layout output depends
on the container's measured size, and a synthetic container spreads nodes
plausibly while a real 0-by-0 one piles them at the origin.

1. **Do** Drag a node somewhere distinctive. From the rig, stage it as
   `n.position("x", 640); n.position("y", 420); n.emit("dragfree");` — the
   object-literal form silently no-ops (see the Xray note above).
   **Expect** it stays where dropped.
   **Probe** read the position back **out of the storage note**, not out of
   Cytoscape: parse the `<pre id="zoterolinkedmindmaps-data">` block and find the
   node by id. Cytoscape agreeing with itself proves nothing. Walked here: 640,420
   in Cytoscape and 640,420 in storage.

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
   Items on Mindmap…** → _Reading trails…_, name it `Method` in the prompt.
   **Expect** "Grouped 3 items on Reading trails". A band-shaped region is drawn
   through those three nodes, labelled "Method", and each gains one membership
   dot.
   **Probe** the document's `groups` array holds `{id, name: "Method"}` and all
   three nodes list that id in `groupIds`. In the DOM the region is
   `svg.mindmap-group-overlay > .mindmap-group-region[data-group-id=...]`, drawn
   as an SVG `<mask>` over stroked lines and circles rather than a filled blob.
   The label is a `<text>` in that overlay — **it can sit outside the viewport**,
   so `cy.fit()` before concluding it is missing, and check the SVG text rather
   than only the screenshot.
   Confirm the region does not fill with `--color-accent`;
   `project/ui-design.md` forbids it for regions.

2. **Do** Select _Layout_, _Tags_ and the "Preprint (link)" attachment. Group
   them as `Layout work`.
   **Expect** two lines in the progress popup: "Grouped 2 items on Reading
   trails" and "1 item was left out: only items and notes can be grouped." The
   attachment is not added. If J3 ran first, _Tags_ is already a node and the
   count stays at six; without J3 it rises by one, never by two. _Layout_ now
   lists **both** group ids in `groupIds` and carries two dots in different
   colours.
   **Probe** the popup closes after three seconds and its text is not logged.
   Wrap `ztoolkit.ProgressWindow.prototype.createLine` (reach it through
   `Zotero.ZoteroLinkedMindmaps.data.ztoolkit`) to record `{type, text}` before
   the step, then read the record.
   **Probe** screenshot. The two regions get distinct colours, overlap at
   _Layout_, and neither erases the other; both labels render above their bands.

3. **Do** Right-click the canvas inside a group's region (see the rig note above;
   selecting a node does nothing here). Type a new name into the menu's input
   and click "Rename group"; right-click the region again and click "Ungroup".
   **Expect** the overlay's `<text>` for that group updates to the new name;
   ungrouping removes the region and the entry in the document's `groups`, and
   every node holds its position.
   **Probe** node positions before and after, and `groups` in the storage note.

4. **Do** In the item pane for _Layout_, use "Remove from group".
   **Expect** one `button.mindmap-remove-from-group` per membership, each naming
   its group ("Remove from \"Method\"", "Remove from \"Layout work\""). Clicking
   the first leaves the other membership intact, drops that button, and the node
   goes from two dots to one.

**Then** `zotero_read_errors`.

---

## J5 · External nodes across mindmaps

Covers the cross-mindmap path: a node that lives on one mindmap appearing on
another, and what happens to it when its home is deleted. This is a whole module
(`crossMindmapCleanup.ts`) with no manual coverage otherwise.

Walked live on 2026-09-14; every expectation below is what happened.

1. **Do** Create another mindmap, `Side reading`. Add _Trails_ and _Structure_
   to it.
   **Expect** the sidebar lists three mindmaps (the default "Mindmap" from J1
   step 1 is still there); switching between them swaps the graph, six nodes
   against two.

2. **Do** With _Trails_ selected in the library, open the section's inline form
   (the picker reads "Side reading") and click "Link to another mindmap…".
   **Expect** two more selects appear in the form: one listing the other
   mindmaps ("Mindmap", "Reading trails"), one for that mindmap's nodes, empty
   until a mindmap is chosen. Still no second window. With only one mindmap in
   the library this control instead reads "No other mindmaps yet."

3. **Do** Choose "Reading trails", then _Attention_ from its nodes, then Save.
   **Expect** the Target reads "Attention Mechanisms in Sparse Graphs (Reading
   trails)" before saving. Afterwards the item pane shows "cites → Attention
   Mechanisms in Sparse Graphs" and _Side reading_ gains a third node with the
   Cytoscape class `external-node`, drawn with the legend's dotted outline and an
   edge from _Trails_.
   **Probe** screenshot, plus `n.classes()` on the new node.

4. **Do** Delete _Reading trails_ (`.mindmap-sidebar-delete` on its row, title
   "Delete"). It opens a native confirm titled "Delete mindmap", drivable like
   the group prompt.
   **Expect** the body: `Delete "Reading trails"? Its links and layout go with
it. The items and notes it points at stay in your library.` Confirm it.
   **Expect** the row leaves the sidebar without a reopen, and on _Side reading_
   the external node and its link are gone both from the live graph and from
   the storage note's `nodes` and `links`.
   **Probe** `zotero_read_errors` immediately — cleanup runs from a notifier
   observer, which is exactly where an unawaited write queue surfaces. Walked
   here: nothing new.

**Then** re-seed by recreating _Reading trails_ if you plan to run J6.

---

## J6 · Deletion and recovery

Covers what happens when Zotero data disappears underneath the plugin. Every step
here is a path where the plugin is reacting to someone else's event, not handling
its own click.

Walked live on 2026-09-09 (steps 1-3) and 2026-09-14 (all eight). Steps 4-6
turned up one behaviour the source confirms and a first draft got wrong: the
trash observer in `containerGuard.ts` only shows the warning. It refreshes
nothing, so an open tab keeps listing and rendering a mindmap whose note was
just trashed until the sidebar next refreshes (select another row, or close and
reopen the tab). Recorded as an open question in the internals docs rather than
fixed here.

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
   mindmap stays hidden until you restore it." It is a dismiss-on-click
   `ProgressWindow` with no close timer, so it is still there when you look.
   The mindmap leaves the sidebar on the sidebar's next refresh, not on the
   trash itself (see the note above); it never renders empty.
   **Probe** the popup's text through the `createLine` wrapper from J4 step 2.

5. **Do** Restore the note.
   **Expect** the mindmap returns intact, links and layout included, again on
   the next sidebar refresh.

6. **Do** Trash the container item "Zotero Linked Mindmaps (plugin data)".
   **Expect** "The Zotero Linked Mindmaps item was moved to the trash. Every
   mindmap in that library stays hidden until you restore it." Close and reopen
   the tab: the sidebar is empty and `#zoterolinkedmindmaps-mindmap-empty-state`
   renders "No mindmaps yet. Create one to start linking items." — this is the
   one path that reaches it. Reopening also raises a second warning, "Mindmap
   data for this library is in the trash. Nothing new was created; restore it to
   get your mindmaps back."
   **Probe** the container tag query returns exactly one item and it is in
   `deletedItems`; no untrashed container appears.

7. **Do** Restart Zotero with the container still trashed.
   **Expect** the startup variant of the same warning.

8. **Do** Restore the container.
   **Expect** every mindmap returns.

**Then** `zotero_read_errors`.

---

## J7 · Preferences and link types

Covers the preferences pane, the link-type editor, and the one preference with a
visible effect on Zotero's own library view.

Steps 3 and 4 need links that already use a type, so run this after J2 (or on an
instance where J2 has run). Step 1 needs a container to exist, which means a
mindmap must have been created at least once — opening the tab is enough.

1. **Do** Open Zotero preferences → **Mindmaps**. Untick "Hide the Zotero Linked
   Mindmaps item from my library".
   **Expect** the pane shows a Link types table with the five defaults (cites,
   supports, contradicts, primary source for = Directional; related to =
   Undirected), `+` / Edit / `−` controls, the Library checkbox, and the Feedback
   section. Unticking makes "Zotero Linked Mindmaps (plugin data)" appear in the
   library list immediately, with no restart; ticking it again removes it.
   **Probe** this is the monkey-patched `Zotero.CollectionTreeRow` path, which has
   no stable seam to assert against. Compare `itemsView.rowCount` before and after
   — walked here it went 8 → 9 — and screenshot both states.

2. **Do** Click `+` (`.zoterolinkedmindmaps-type-add`). The form has a Label
   input and a Directional checkbox, ticked by default. Type `extends` and
   Save.
   **Expect** a sixth `.zoterolinkedmindmaps-type-row` reading "extends
   Directional", the same entry at the end of the `linkTypes` pref, and
   "extends" as the last option in the add-link form's Type select the next
   time you open it.

3. **Do** Select a row, click Edit (disabled until a row is selected), change
   the label, Save.
   **Expect** the row shows the new label. Links already using the type show it
   too, since links store the type id rather than its label, **but only on
   their next render**: an item pane already showing the link keeps the old
   label until the selection changes, and an open graph keeps it until the tab
   is reopened or a write triggers the live refresh. Nothing observes the
   `linkTypes` pref; only `hideMindmapNotes` has an observer.

4. **Do** Select a type that links are using and click `−`
   (`.zoterolinkedmindmaps-type-remove`). It opens a native confirm titled
   "Delete link type".
   **Expect** the body names the count across every mindmap in every library:
   "Delete this link type? 2 links use it and will show as \"(unknown type)\"
   there." Confirm.
   **Expect** the row is gone and the links are not: the storage note still
   holds them with the deleted type id. On their next render (same caveat as
   step 3) they read "(unknown type)" in the item pane and the edge carries the
   Cytoscape class `unknown-type` with a dotted line, matching the legend.

5. **Do** Open the Feedback section and click "Report a bug…".
   **Expect** a GitHub form opens in the browser, prefilled with plugin version,
   Zotero version, OS and recent errors. **Read what is prefilled before
   submitting anything.** Do not paste the result anywhere: this project's
   `getSystemInfo()` output embeds the full installed-plugin list.
   **Probe** from the rig, do not let it launch the browser on the user's
   desktop: replace `Zotero.launchURL` with a function that records its
   argument, click the button, restore it, and parse the recorded URL. Walked
   here it was `https://github.com/oekeur/zotero-linked-mindmaps/issues/new`
   with `template=bug_report.yml`, `plugin-version`, `zotero-version` and
   `os=Linux`. A `debug-output` parameter appears only when the error console
   holds an entry carrying the `[zoteroLinkedMindmaps]` prefix; other plugins'
   and Zotero's own entries are deliberately left out, and none of the 25
   entries a session accumulates need be the plugin's. To exercise it, log one
   with `Zotero.logError(new Error("[zoteroLinkedMindmaps] probe"))` and
   **wait a moment before clicking**: the console buffer that `getErrors` reads
   fills asynchronously, and a click in the same tick builds the URL without
   it. That looked like a missing parameter once.

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
