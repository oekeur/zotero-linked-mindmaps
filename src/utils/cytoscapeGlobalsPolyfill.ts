// Cytoscape's bundle references several browser globals as bare, unqualified
// identifiers (document, Image, ResizeObserver, MutationObserver) instead of
// going through the container's own window (e.g. cy.window().document).
// Those identifiers aren't defined in this plugin's privileged execution
// scope, even though the real objects exist on Zotero's actual window --
// confirmed for `document` (blurActiveDomElement in cytoscape's mousedown
// handler throws a ReferenceError on every click, silently breaking pan/tap
// while rendering and wheel-zoom still work) and `ResizeObserver` (silently
// disabled instead of throwing, so element-level resizes -- e.g. a Zotero
// pane splitter or sidebar toggle that doesn't change the OS window size --
// never invalidate Cytoscape's cached container bounds or trigger a redraw).
//
// Call this with the window that will host the Cytoscape instance, before
// constructing it. Idempotent -- safe to call on every render.
export function ensureCytoscapeWindowGlobals(win: Window) {
  const g = globalThis as any;
  const w = win as any;
  if (typeof g.document === "undefined") g.document = win.document;
  if (typeof g.Image === "undefined") g.Image = w.Image;
  if (typeof g.ResizeObserver === "undefined")
    g.ResizeObserver = w.ResizeObserver;
  if (typeof g.MutationObserver === "undefined")
    g.MutationObserver = w.MutationObserver;
}
