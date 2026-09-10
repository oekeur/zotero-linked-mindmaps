# Why the MCP observability rig was adopted

Trialled 2026-09-04 against `@introfini/mcp-server-zotero-dev@1.1.3` with its
companion `zotero-mcp-bridge` plugin at `plugin-v1.0.5`, on Zotero
10.0-beta.25 under Linux. **Verdict: adopt.**

The comparison is not against a good status quo. `zotero-plugin-scaffold`
discards Zotero's stdout and never passes `-ZoteroDebugText`, so before this
there was no log stream at all, and every visual check was handed to a human.
The manual verification protocol said as much: step 2 recorded that no log file
exists, and step 6 suggested replacing `Zotero.debug()` calls with `alert()` to
find out whether code ran.

zoteroTimeline adopted the same rig first and has been running it since
2026-08-20. This trial therefore did not have to re-answer whether the approach
works; it had to answer what changes here, and whether the UI half is worth
anything against Cytoscape specifically.

## What the rig is

Two halves. An MCP server that runs under the AI client, and a small Zotero
plugin (the bridge) that opens a Firefox Remote Debugging Protocol listener on
a port agreed in advance. The server drives Zotero through that listener.

The bridge exists because the port scaffold already opens cannot be reached.
`npm start` does start a DevTools server, but `findFreeTcpPort()` binds an
OS-assigned ephemeral port that changes every run and is logged only at `trace`.

## What changed for this project

Two things, both in the [howto](./mcp-observability-howto.md).

The worktree hook now installs the bridge and assigns a port, so a fresh
worktree comes up observable instead of needing a manual install into a profile
that `worktree-init.sh` had just replaced.

The port pool is split with zoteroTimeline, and **this repo does not own 6100**.
That is the one thing most likely to waste someone's afternoon: the bare
`zotero-dev` entry is the other project's, and pointing it at work done here
either fails to connect or quietly answers from the wrong Zotero. The split is
static because neither hook can see the other repo's checkouts; the reasoning is
in the howto.

## What the UI half is actually worth

This was the open question, since the tab is Cytoscape drawing into a canvas and
a canvas is opaque to a DOM tree.

It is worth more than expected, for a reason that has nothing to do with the
canvas. Cytoscape registers its instance on the container element as `_cyreg`,
so `zotero_execute_js` can read every node's id, label, group flag, model
position and rendered size. A layout regression can therefore be asserted
numerically rather than judged by eye, which is the failure mode that made
layout untestable here in the first place.

The screenshot is worth having alongside it, and proved so immediately. The
first capture taken during this trial, of a six-node mindmap, showed three
things nobody had asked about: a node label overflowing its circle and being
clipped at the window edge, a node rendering with no label at all, and a group
caption colliding with its own border. None of those would have failed a test,
and none were the thing being looked for.

The Connections dock answers to both `zotero_get_dom_tree` and
`zotero_get_styles` once a node is selected, down to individual link rows and
their computed flex layout. Selection has to go through Cytoscape's own `tap`
event; a synthetic `MouseEvent` does not reach it.

## What it does not replace

The suite. The rig inspects one running instance in one state; `npm test` still
covers the data-model and storage logic, and `scripts/verify.sh` still sequences
build, lint, typecheck and the live startup check.

It also cannot answer the question that has caused every third-party-library
crash in this codebase so far: whether a global exists in the **bootstrap**
scope where the plugin bundle evaluates. `zotero_execute_js` runs in the main
window's chrome scope, where `document`, `Image`, `ResizeObserver` and the rest
all exist, so it will always say yes. Reading the bundled source at the failing
line, as step 7 of the verification protocol says, is still the way.

## The dependency

`introfini/mcp-server-zotero-dev`, MIT, single author. Both halves are pinned
exactly and both are cached under `~/.cache/zotero-mcp-bridge/`: the server at
`server-1.1.3/`, the bridge at `plugin-v1.0.5/`, each installed once per machine
by the worktree hook. The pin on the bridge is not caution for its own sake —
the port preference does nothing before `plugin-v1.0.5`, whose 1.0.4 release
notes claimed the fix and shipped without it.

The client entries invoke that cached copy as a plain node entry point rather
than through `npx -y`. npx forks `npm exec` into `sh -c` into node, so every
registered entry cost three processes and a registry check at each session
start. Never point an entry at `~/.npm/_npx/<hash>/`: the directory name is a
content hash and moves on a version bump.

Nothing in `package.json` depends on it. The rig is development tooling that
sits beside the repo, so if it goes unmaintained the plugin is unaffected and
the loss is the observability, not the build.
