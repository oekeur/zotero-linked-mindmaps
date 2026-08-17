# Reproduction

## The documentation gap

```
$ grep -rn "Missing global variables" zotero-plugin-docs/docs/main/privileged-vs-unprivileged.md
43:> ❗️ Missing global variables is the major cause that some third-party libraries designed for the web cannot work in the browser window.
```

That is the whole of it. Searching the docs for the globals involved:

```
$ grep -rln "ResizeObserver\|getter-only\|globalThis" zotero-plugin-docs/docs/
(no matches)
```

`console` appears twice in the entire guide, once in a list of launch flags and
once as `Zotero.getMainWindow().console.log(...)` inside a Run JS example
(`docs/main/your-first-zotero-plugin.md:61,134`). The second implicitly
acknowledges that a bare `console` is not there, without saying so.

## Failure 1: `console` at module evaluation

Cytoscape's CJS bundle, at top level:

```
$ grep -n "warnSupported = " node_modules/cytoscape/dist/cytoscape.cjs.js
1495:var warnSupported = console.warn != null;
```

Top-level statement, so it runs on `import cytoscape from "cytoscape"`, before any
plugin code gets a chance to install a shim.

Symptom: `startup()` aborts. The plugin appears in Tools → Plugins as installed,
and none of its initialisation runs. The scaffold's temporary install can report
success even so, and the error surfaces only on a later hot reload, where
Zotero's bootstrap error UI shows `Error running bootstrap method 'startup'`.

Fix used: `src/utils/consolePolyfill.ts`, imported as the first statement of
`src/index.ts` so it runs before any third-party module is evaluated:

```ts
if (typeof console === "undefined") {
  (globalThis as any).console = {
    log: (...args: any[]) => Zotero.debug(args.join(" ")),
    warn: (...args: any[]) => Zotero.debug(args.join(" ")),
    error: (...args: any[]) => Zotero.debug(args.join(" ")),
    ...
  };
}
```

## Failure 2: bare `document` on every mousedown

Cytoscape's `blurActiveDomElement()` references bare `document` rather than the
container's `ownerDocument`:

```
$ sed -n '25885,25889p' node_modules/cytoscape/dist/cytoscape.cjs.js
  var blurActiveDomElement = function blurActiveDomElement() {
    if (document.activeElement != null && document.activeElement.blur != null) {
      document.activeElement.blur();
    }
  };

$ grep -n "blurActiveDomElement()" node_modules/cytoscape/dist/cytoscape.cjs.js
26011:    blurActiveDomElement();
26744:    blurActiveDomElement();
```

Both call sites are on the mousedown path.

Symptom: pan and tap stop working, wheel-zoom continues to work, and nothing is
logged. The graph renders correctly, which points suspicion at event wiring
rather than at a missing global.

Diagnosis: reading the bundled source at the throwing line, around line 25885 of
`node_modules/cytoscape/dist/cytoscape.cjs.js`. Nothing else surfaced it, because
the ReferenceError is swallowed on the library's internal path.

## Failure 3: `ResizeObserver` absent, no error at all

Cytoscape checks for `ResizeObserver` and skips container-size tracking when it is
not there.

Symptom: the graph renders and then never reacts to its container changing size
from anything other than an OS window resize. A Zotero pane splitter drag or a
sidebar toggle leaves the cached container bounds stale, so hit-testing drifts
away from what is drawn. No error, no warning, and the cause is one indirection
away from the symptom.

## The getter-only wrinkle

Recorded from this project's investigation on 2026-08-16, verified at the time
with `Object.getOwnPropertyDescriptor`:

```js
Object.getOwnPropertyDescriptor(globalThis, "document");
// => { get: <function>, set: undefined, enumerable: ..., configurable: false }
```

Consequences observed:

- `typeof globalThis.document` returns `"object"`, not `"undefined"`, so a guard
  written as `if (typeof g.document === "undefined")` never fires
- `globalThis.document = win.document` throws
  `TypeError: setting getter-only property "document"`

Which means a shim has to check the descriptor and use `Object.defineProperty`
rather than assignment.

**Not fully mapped.** Presence appears to vary by execution scope, since the
plugin's own shim also handles the genuinely-absent case and that path does fire
in some scopes. The full matrix across the bootstrap sandbox, the main-window
scope, and a bundled script loaded into either was not systematically tested, and
it may differ between Zotero versions. Whoever writes the docs page should
re-derive it per scope with `Object.getOwnPropertyDescriptor` instead of
transcribing this.

## Shim used here

`src/utils/cytoscapeGlobalsPolyfill.ts`, called with the hosting window before
constructing the library:

```ts
let hostWindow: Window | undefined;

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
```

Two details that matter and are not obvious: it defines only globals that are
genuinely absent, leaving anything Zotero pre-wired alone, and each installed
global reads through the mutable `hostWindow` rather than capturing a window at
definition time, so a graph opened in a second main window does not keep
operating on the first window's document after the user closes it.
