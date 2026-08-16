// Cytoscape's bundle references several browser globals as bare, unqualified
// identifiers (document, Image, ResizeObserver, MutationObserver) instead of
// going through the container's own window (e.g. cy.window().document).
// Those identifiers aren't defined in every one of this plugin's execution
// scopes, even though the real objects exist on Zotero's actual window --
// confirmed for `document` (blurActiveDomElement in cytoscape's mousedown
// handler throws a ReferenceError on every click, silently breaking pan/tap
// while rendering and wheel-zoom still work) and `ResizeObserver` (silently
// disabled instead of throwing, so element-level resizes -- e.g. a Zotero
// pane splitter or sidebar toggle that doesn't change the OS window size --
// never invalidate Cytoscape's cached container bounds or trigger a redraw).
//
// Call this with the window that will host the Cytoscape instance, before
// constructing it. Safe to call on every render.

// The window that rendered most recently. What each installed global resolves
// to is read through this rather than captured when the global is installed:
// Zotero can have several main windows, and a graph opened in a second one
// would otherwise still be operating on the first window's document, which by
// then may belong to a window the user has closed.
let hostWindow: Window | undefined;

// A global already present belongs to whatever put it there - Zotero's own
// scope, or the toolkit - and is often a getter-only property that throws on
// assignment. Only the ones genuinely missing get filled in.
function defineFromHost(name: string, read: (win: Window) => unknown): void {
  const g = globalThis as any;
  if (typeof g[name] !== "undefined") {
    return;
  }
  Object.defineProperty(g, name, {
    configurable: true,
    get: () => (hostWindow ? read(hostWindow) : undefined),
  });
}

export function ensureCytoscapeWindowGlobals(win: Window) {
  hostWindow = win;
  defineFromHost("document", (w) => w.document);
  defineFromHost("Image", (w) => (w as any).Image);
  defineFromHost("ResizeObserver", (w) => (w as any).ResizeObserver);
  defineFromHost("MutationObserver", (w) => (w as any).MutationObserver);
}
