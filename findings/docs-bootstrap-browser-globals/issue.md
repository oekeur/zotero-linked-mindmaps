**Title:** Docs request: bundling browser-targeted libraries into a plugin (missing and getter-only globals)

### What is missing

`docs/main/privileged-vs-unprivileged.md:43` says:

> ❗️ Missing global variables is the major cause that some third-party libraries
> designed for the web cannot work in the browser window.

That is accurate and it is where the guidance ends. There is nothing on which
globals, how to recognise the resulting failures, or how to shim them. Searching
the guide for `ResizeObserver`, `globalThis` or `getter-only` returns nothing.

Bundling a normal npm graph, chart or DOM library is a common thing for a plugin
to want, and it fails in ways that are hard to attribute.

### What we hit, adding Cytoscape.js

Three failures, one library, all opaque:

1. **`console` at module evaluation.** The CJS bundle runs
   `var warnSupported = console.warn != null;` at top level
   (`cytoscape.cjs.js:1495`). With no `console` in scope, `import cytoscape` throws
   during module evaluation and aborts `startup()`. The plugin still shows up in
   Tools → Plugins as installed and simply does nothing.
2. **Bare `document` on every mousedown.** `blurActiveDomElement()`
   (`cytoscape.cjs.js:25885`) uses bare `document`, not `container.ownerDocument`.
   Pan and tap die while wheel-zoom keeps working, and nothing is logged, so the
   partial behavior points at event wiring rather than at a global.
3. **`ResizeObserver` absent, silently.** Cytoscape checks for it and skips
   container-size tracking. The graph renders, then never notices a splitter drag
   resizing its container, so hit-testing drifts from what is drawn. No error at
   all.

In every case the only diagnostic that worked was reading the bundled library
source at the failing line.

### The part we would most like documented

Plain assignment is not always available. In at least one plugin execution scope,
`document`, `Image`, `ResizeObserver` and `MutationObserver` are present as
getter-only, non-configurable properties rather than absent:

```js
Object.getOwnPropertyDescriptor(globalThis, "document");
// => { get: <function>, set: undefined, configurable: false }
```

So `typeof globalThis.document === "undefined"` is false, which defeats the
obvious guard, and `globalThis.document = win.document` throws
`TypeError: setting getter-only property "document"`. A shim has to inspect the
descriptor and use `Object.defineProperty`.

We did not map presence across every scope systematically, and it may vary by
Zotero version, so that part needs verifying before it goes in.

### Suggested page outline

- which globals bundled libraries reach for, and where each is available:
  `console`, `document`, `window`, `Image`, `ResizeObserver`, `MutationObserver`,
  `fetch`, `localStorage`
- the two timing classes, since they need different fixes: module-evaluation time
  (the shim must be imported before any other import) and runtime (per window,
  before the library is constructed)
- `Object.defineProperty` versus assignment, and checking the descriptor first
- reading the bundled source at the failing line as the primary diagnostic
- the silent variants, where a library checks for a global and quietly degrades

### Offer

We have working code for the two shims and written-up symptoms for all three
failures, and can draft the page if it is wanted. Related: the guide recommends
running with `-ZoteroDebugText` and `-jsconsole`
(`docs/main/your-first-zotero-plugin.md:61`), which `zotero-plugin-scaffold` does
not pass, so debugging these under `npm start` is harder than the docs imply.
Filed separately against the scaffold.
