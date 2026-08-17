# Running Cytoscape inside Zotero's plugin scope

Cytoscape.js is written for a browser page. Zotero 7 plugins run in a bootstrap sandbox attached to a XUL chrome window, which is close enough that most of Cytoscape works untouched, and far enough that the gaps are sharp, silent, and expensive to find. Every constraint on this page cost real debugging time. Not one of them announced itself with a useful error.

The library choice itself, and why the plugin uses a graph-layout library instead of a hand-rolled layout engine, is settled in `project/PRODUCT.md`. This page is about what running it here demands.

## The bare globals Cytoscape assumes

Cytoscape's bundle reaches for several browser globals as unqualified identifiers instead of going through the container's own window, even though `cy.window().document` was available to it. In this plugin's execution scopes those identifiers aren't always bound, even though the real objects exist on Zotero's actual window.

Two of them were confirmed by failure. `document` gets read by `blurActiveDomElement` inside Cytoscape's own mousedown handler, and with no binding every click on the graph threw a `ReferenceError`. Pan and tap broke while rendering and wheel-zoom kept working, so the graph looked perfectly fine until you touched it. `ResizeObserver` failed the other way around: Cytoscape checks for it and quietly does without, so element-level resizes (a Zotero pane splitter, the mindmap tab's own sidebar toggle) never invalidated its cached container bounds and never triggered a redraw. `Image` and `MutationObserver` are filled in on the same reasoning, though neither has been observed to fail.

`src/utils/cytoscapeGlobalsPolyfill.ts` installs them, and how it installs them is the part that matters.

## Why `defineProperty` and not assignment

Some of these names are already present in some Zotero scopes, put there by Zotero itself or by the plugin toolkit, and they are frequently getter-only, non-configurable properties. Assign to one and you either throw or silently do nothing, depending on strictness. So the polyfill never assigns. It checks `typeof g[name] !== "undefined"` and leaves anything already bound alone, on the grounds that whatever put it there owns it. For the genuinely missing ones it calls `Object.defineProperty` with `configurable: true` and a getter.

The getter isn't a captured value. It reads through a module-level `hostWindow` that `ensureCytoscapeWindowGlobals(win)` updates on every call. Zotero can have several main windows, and a global that captured the first window's `document` would leave a graph opened in a second window operating on a document belonging to a window the user may since have closed. `ensureCytoscapeWindowGlobals` gets called at the top of `renderMindmap` on every render, which is what keeps the pointer current.

The renderer carries a Zotero-specific shim of its own as well. Zotero's main chrome window is a XUL document with no `<head>` element, and Cytoscape's canvas renderer unconditionally does `document.head.insertBefore(...)` on init to inject a stylesheet. `ensureDocumentHead` creates an XHTML `<head>`, appends it to the document element, and installs it as `doc.head` with `defineProperty`, for the same reason as above: the property isn't assignable. This runs before the Cytoscape instance is constructed.

The `ResizeObserver` case has a second half. Even with the global installed, Cytoscape's own internal observer doesn't deliver for elements in Zotero's main window, so the renderer wires one up explicitly. `observeContainerSize` reads `ResizeObserver` off the host window object rather than off a bare global, observes the container, calls `cy.resize()` on every change, and disconnects when the instance is destroyed. `cy.resize()` clears both caches that go stale on a layout change: the canvas size cache, and `containerBB`, the container's on-screen offset that pointer coordinates are measured against. A stale `containerBB` is why clicks land on the wrong node, or on nothing at all, after the sidebar collapses or the dock opens. The graph draws correctly the entire time, so nothing looks broken until you click.

Full symbol details are in [polyfills-reference.md](polyfills-reference.md).

## The container has to be positioned

Cytoscape absolutely positions its canvases inside the container element, so the container has to establish a positioning context. `position: relative` on the graph container is a hard requirement and not a styling preference. Without it the canvases resolve against some ancestor further up the XUL tree, and the graph renders somewhere other than where its container is, or not visibly at all.

The mindmap tab sets it on `#zoterolinkedmindmaps-mindmap-container`, together with `flex: 1 1 0` and `min-width: 0`. That `min-width: 0` is a separate trap hiding in the same line. A flex item defaults to `min-width: auto`, its content-based minimum, and Cytoscape's container carries enough of one that the graph refuses to shrink, the row overflows, and the Connections dock gets pushed off the right edge of the tab, where it renders happily but can't be seen or reached.

Every test that renders a real graph sets `position: relative; width: ...; height: ...` on its container for the same reason. A test that forgets it doesn't fail loudly.

## Layout tests need a real DOM

This is the testing limitation to know about before you write a layout test.

A headless `cytoscape()` core, built with no container at all, spreads nodes when you run cose over it. A real container with a measured size of zero by zero doesn't. Cose falls back to the container's viewport extent for its bounding box, finds nothing to spread into, and leaves every node on the `(0, 0)` it was rendered at. Those coordinates then get persisted as real positions, and since every node now has a position the layout never runs again, so the pile is permanent.

Zero by zero isn't a contrived case, either. It is the state the mindmap tab is actually in when it renders: the tab is created with `Zotero_Tabs.add()` and the graph is built and laid out immediately afterwards, before the tab container has been measured.

So a headless probe can't reproduce the bug, and a test written against one passes cheerfully while the real tab piles. The fix is in [`layoutUnplacedNodes`](layout-reference.md), which computes the bounding box from the node count and passes it to cose explicitly, so the container's measurement never enters into it. The regression guard is the one graphRenderer test that builds a container styled `width: 0px; height: 0px`, renders into it, lays out, and asserts the two nodes aren't coincident. The layout module's own tests stay headless on purpose, which keeps them independent of Zotero item resolution and of the `document.head` shim. They carry the same property, since a headless core also has no measured viewport, but they aren't what proves the zero-size case.

Two smaller test-facing facts follow from this. Cytoscape owns and mutates the position object it is handed, which is why `buildNodeElement` copies coordinates into a fresh object before passing them along; a test that hands the same object twice can end up asserting something vacuously true. And the tests that exercise dragging emit `dragfree` directly on nodes instead of synthesizing pointer input against a canvas, because the gesture itself isn't reproducible headlessly.

## Debugging when something here breaks

Every failure mode above was silent, and the repository's manual verification protocol in `CLAUDE.md` exists largely because of them. Two habits from it apply directly to Cytoscape work. When a bare `ReferenceError` comes out of a third-party library, read the bundled source at the failing line (`node_modules/cytoscape/dist/*.js`) instead of guessing; the missing browser global has been the root cause every single time so far. And when Zotero's Debug Output shows nothing where you expect an error, don't read that as success. Console output can be filtered or misrouted, and bracketing the failing operation with `ztoolkit.getGlobal("alert")("Reached: <location>")` is the reliable way to confirm what actually ran.

## Related

- [polyfills-reference.md](polyfills-reference.md), the polyfill module's symbols
- [rendering-reference.md](rendering-reference.md) and [rendering-explanation.md](rendering-explanation.md)
- [layout-reference.md](layout-reference.md), the explicit bounding box that removes the container dependency
- [../contributing/testing-explanation.md](../contributing/testing-explanation.md) and [../contributing/testing-howto.md](../contributing/testing-howto.md)
- [lifecycle-explanation.md](lifecycle-explanation.md), the plugin scope these constraints come from
