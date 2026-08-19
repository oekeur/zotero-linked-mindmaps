// Cytoscape's bundle references the global `console` object at module
// top-level (unguarded). Zotero's bootstrap sandbox doesn't provide one, so
// importing cytoscape throws and aborts plugin startup. Must be imported
// before anything that (transitively) imports cytoscape.
import { logFailure, logTrace } from "./logging";

if (typeof console === "undefined") {
  (globalThis as any).console = {
    log: (...args: any[]) =>
      logTrace(`[zoteroLinkedMindmaps] ${args.join(" ")}`),
    warn: (...args: any[]) =>
      logTrace(`[zoteroLinkedMindmaps] ${args.join(" ")}`, 2),
    error: (...args: any[]) =>
      logFailure(`[zoteroLinkedMindmaps] ${args.join(" ")}`),
    group: (...args: any[]) =>
      logTrace(`[zoteroLinkedMindmaps] ${args.join(" ")}`),
    groupCollapsed: (...args: any[]) =>
      logTrace(`[zoteroLinkedMindmaps] ${args.join(" ")}`),
    groupEnd: () => {},
    trace: () => {},
  };
}
