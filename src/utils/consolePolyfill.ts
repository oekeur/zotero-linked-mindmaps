// Cytoscape's bundle references the global `console` object at module
// top-level (unguarded). Zotero's bootstrap sandbox doesn't provide one, so
// importing cytoscape throws and aborts plugin startup. Must be imported
// before anything that (transitively) imports cytoscape.
if (typeof console === "undefined") {
  (globalThis as any).console = {
    log: (...args: any[]) => Zotero.debug(args.join(" ")),
    warn: (...args: any[]) => Zotero.debug(args.join(" ")),
    error: (...args: any[]) => Zotero.debug(args.join(" ")),
    group: (...args: any[]) => Zotero.debug(args.join(" ")),
    groupCollapsed: (...args: any[]) => Zotero.debug(args.join(" ")),
    groupEnd: () => {},
    trace: () => {},
  };
}
