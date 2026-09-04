# Use the MCP observability rig to debug a running Zotero

The rig reads Zotero's debug buffer, reports the error behind "Error running
bootstrap method", screenshots the running window, and reaches into the live
Cytoscape graph. Reach for it whenever a failure is silent, which in this
codebase is most of them.

Why it was adopted, and what it cannot do, is in
[Why the MCP observability rig was adopted](./mcp-observability-explanation.md).

## Set it up

The install lives in the dev profile, and `worktree-init.sh` mints a fresh one
per worktree, so this is once per checkout. Almost all of it is automatic.

1. Run `~/.claude/scripts/worktree-init.sh`. Its hook
   (`~/.claude/worktree-hooks/zoteroMindmap.sh`) downloads the pinned bridge
   into `~/.cache/zotero-mcp-bridge/plugin-v1.0.5/` on first use, installs it
   into this checkout's dev profile as a proxy file, assigns an RDP port, and
   writes it into `.env` as `ZOTERO_MCP_RDP_PORT`. It prints the port and the
   MCP entry name to call.

   `zotero-plugin.config.ts` carries the other half: `server.prefs` writes
   `extensions.mcp-rdp.port` from that variable and arms
   `extensions.zotero.debug.store` before every launch. The arming is per launch
   by necessity, because Zotero's `Debug.init` reads the preference once and
   immediately clears it, and turning it on by hand later has already missed
   every startup line.

   That clearing is also why `debug.store` is **not** in the profile's
   `prefs.js` after a launch: setting a preference back to its default drops the
   `user_pref` line entirely. Its absence there is the mechanism working, not a
   failed write. `extensions.mcp-rdp.port` does stay, so that is the one to grep
   for when checking a profile.

2. Nothing to register. The client pool is already in Oscar's user config.

3. Call the entry that matches your port, then run `npm start`, call
   `zotero_ping`, and **read the data directory it reports back**. See the port
   section below for why that check is not optional.

## Which port is this repo's

The pool (`zotero-dev` on 6100, `zotero-dev-6101` through `6110`) is one
machine-wide resource shared with zoteroTimeline, which carries the same rig. It
is split by static range:

| checkout                 | ports     | MCP entry           |
| ------------------------ | --------- | ------------------- |
| zoteroTimeline main      | 6100      | `zotero-dev`        |
| zoteroTimeline worktrees | 6101-6105 | `zotero-dev-<port>` |
| **zoteroMindmap main**   | **6106**  | `zotero-dev-6106`   |
| zoteroMindmap worktrees  | 6107-6110 | `zotero-dev-<port>` |

**This repo never answers on the bare `zotero-dev` entry.** That one is
zoteroTimeline's. Calling `mcp__zotero-dev__*` while working here either fails
to connect or, worse, succeeds against the other project's Zotero.

The split is static rather than negotiated because neither hook can see the
other repo's checkouts: each walks only its own `git worktree list` when looking
for a free port, and the `ss` scan finds only ports listening right now, not
ones already claimed in some other checkout's `.env`. The two hooks' range
constants have to stay consistent with each other.

Sharing a port fails silently, which is the whole reason for the split: the
second Zotero binds nothing, its window looks entirely normal, and the MCP
client keeps answering from the **first** one. `zotero_ping` still succeeds. It
just describes the wrong instance. Confirm the data directory after every
`npm start`.

## Which call answers which question

Reach for the narrowest tool that answers the question.

| Symptom                                    | Call                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Startup broke, or something failed quietly | `zotero_read_errors` — the real message, not just "Error running bootstrap method" |
| Need this plugin's own trace               | `zotero_read_logs` with a `filter`, once `debug.store` is armed                    |
| Tab renders blank, wrong or unstyled       | `zotero_screenshot`, then `zotero_get_dom_tree`                                    |
| A control looks right but behaves wrong    | `zotero_get_styles` on the element                                                 |
| Need live state, or to drive the plugin    | `zotero_execute_js`                                                                |
| Question about stored library data         | `zotero_db_query` — it reads fine while Zotero runs                                |

When a render looks empty, take the screenshot **and** the DOM tree. Together
they separate the two cases that look identical from the outside: an element
tree that is present but invisible is a CSS problem, one that is missing is a
render or exception problem.

Skip `zotero_scaffold_build`, `serve`, `lint` and `typecheck`. `scripts/verify.sh`
already sequences those cheapest-first, runs every stage after a failure, and
names which one failed.

## Reaching the Cytoscape graph

The plugin exposes no opener or graph handle on `Zotero.ZoteroLinkedMindmaps`
(`api` is empty), so drive it through the surfaces a user would:

```js
// Open the tab
doc.getElementById("zotero-linked-mindmaps-menuitem-open-mindmap").doCommand();

// The live Cytoscape instance, registered by Cytoscape on its container
const cy = doc.getElementById("zoterolinkedmindmaps-mindmap-container")._cyreg
  .cy;
cy.nodes().map((n) => ({
  id: n.id(),
  label: n.data("label"),
  pos: n.position(),
}));
```

`_cyreg.cy` is what makes layout assertions possible: it returns each node's
id, label, `isGroup` flag, model position and rendered width and height, so a
regression can be checked numerically instead of by eye.

The Connections dock is `display: none` at zero size until a node is selected,
and selection has to go through Cytoscape's own event, not a synthetic
`MouseEvent`:

```js
cy.$("#<nodeId>").emit("tap"); // then wait ~1s for the dock to populate
```

## What it will not tell you

`zotero_execute_js` runs in the main window's chrome scope, where `document`,
`window`, `Image`, `ResizeObserver` and `MutationObserver` all exist. It cannot
tell you whether a global exists in the **bootstrap** scope where a plugin
bundle evaluates, because it will always say yes. That question still needs a
probe inside the plugin itself, which is where every such crash in this codebase
has come from.

Two smaller edges. `zotero_get_styles` can return fewer properties than asked
for without saying so, so treat an absent property as unanswered rather than as
a value. And `zotero_db_stats` miscounts libraries; use `zotero_db_query`.
