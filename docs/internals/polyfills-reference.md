# Browser-global polyfills reference

Zotero's plugin sandbox is not a browser window. Several globals that browser-targeted bundles reference as bare identifiers are absent from it. Cytoscape is such a bundle, so the plugin installs two shims.

Neither shim replaces a global that already exists.

## `src/utils/consolePolyfill.ts`

No exports. Imported for its side effect.

Runs one check at module evaluation:

```ts
if (typeof console === "undefined") {
  (globalThis as any).console = { … };
}
```

The object it installs has seven members. `log`, `warn`, `error`, `group` and `groupCollapsed` each take `...args: any[]` and forward `args.join(" ")` to `src/utils/logging.ts`'s `logTrace`/`logFailure`, not to `Zotero.debug` directly - `error` goes through `logFailure` (reaches `Zotero.getErrors()` even without debug logging enabled), `warn` through `logTrace` at a distinct level, and `log`/`group`/`groupCollapsed` through plain `logTrace`. See [logging-reference.md](logging-reference.md). `groupEnd` and `trace` are no-ops.

**When it must run:** before anything that transitively imports Cytoscape. Cytoscape's bundle references `console` at module top level, unguarded, so importing it into a scope without a `console` throws and aborts plugin startup before any hook runs.

The plugin enforces the ordering by making `import "./utils/consolePolyfill";` the first statement of `src/index.ts`, ahead of every other import including `zotero-plugin-toolkit` and `./addon`. esbuild preserves that order in the bundle.

Nothing calls into this module; there is no function to invoke and no teardown.

## `src/utils/cytoscapeGlobalsPolyfill.ts`

Exports `ensureCytoscapeWindowGlobals(win: Window): void`.

### What it installs

Four globals, each defined on `globalThis` and each reading from the host window rather than holding a captured value:

| Global             | Resolves to                   |
| ------------------ | ----------------------------- |
| `document`         | `hostWindow.document`         |
| `Image`            | `hostWindow.Image`            |
| `ResizeObserver`   | `hostWindow.ResizeObserver`   |
| `MutationObserver` | `hostWindow.MutationObserver` |

`hostWindow` is a module-level variable holding the window passed to the most recent call.

### How it installs them

The local helper `defineFromHost(name, read)` returns immediately when `typeof globalThis[name] !== "undefined"`. A global already present belongs to whoever put it there, Zotero's own scope or the toolkit, and is often a getter-only property that throws on assignment. Only genuinely missing names get filled in.

For a missing name it calls `Object.defineProperty(globalThis, name, { configurable: true, get: () => hostWindow ? read(hostWindow) : undefined })`. Defining a getter rather than assigning a value is what makes the indirection work: each read resolves against `hostWindow` as it stands at that moment.

`ensureCytoscapeWindowGlobals(win)` sets `hostWindow = win`, then calls `defineFromHost` for each of the four names.

### When it must run

With the window that will host the Cytoscape instance, before that instance is constructed. `renderMindmap` in `src/modules/mindmap/graphRenderer.ts` calls it on `container.ownerDocument.defaultView` immediately before `cytoscape({ container, … })`. Safe to call on every render, and it is called on every render.

The re-read through `hostWindow` matters when Zotero has several main windows. A graph opened in a second window would otherwise still be operating on the first window's document, which by then may belong to a window the user has closed.

### Why these four

Cytoscape's bundle reaches for them as bare, unqualified identifiers instead of going through the container's own window (`cy.window().document` and similar). Two of the four have confirmed failure modes in this codebase:

- `document`: `blurActiveDomElement` in Cytoscape's mousedown handler throws a `ReferenceError` on every click. Rendering and wheel-zoom keep working, so pan and tap break silently.
- `ResizeObserver`: silently disabled rather than throwing. Element-level resizes that do not change the OS window size, a Zotero pane splitter or a sidebar toggle, never invalidate Cytoscape's cached container bounds and never trigger a redraw.

`Image` and `MutationObserver` are covered by the same mechanism as a matter of policy, not because a specific failure was traced to each. Once the bug class was confirmed real, the whole class was filled in rather than one identifier at a time.

### Teardown

None. The properties stay defined on `globalThis` for the life of the plugin scope. They are `configurable: true`, so a later definition can replace them.

## Diagnosing a new one

A third-party library throwing a bare `ReferenceError` for a browser global is the signature of this bug class. The working method, recorded in the repository's manual verification protocol, is to read the bundled source directly at the failing line (`node_modules/<pkg>/dist/*.js`) rather than guessing which identifier is missing. See [testing-explanation.md](../contributing/testing-explanation.md).

Note that some of these globals are already present in some Zotero scopes as non-configurable getters, which is why `defineFromHost` checks before defining and why assignment is not used anywhere in this file.

## See also

- [cytoscape-explanation.md](cytoscape-explanation.md) for the wider set of constraints Cytoscape imposes inside Zotero.
- [rendering-reference.md](rendering-reference.md) for `renderMindmap` and the call site.
- [lifecycle-reference.md](lifecycle-reference.md) for the import ordering in `src/index.ts`.
