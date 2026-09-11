# No guidance on bundling browser-targeted libraries into a plugin

**Repo:** `windingwind/doc-for-zotero-plugin-dev`
**Location:** `docs/main/privileged-vs-unprivileged.md:43` is the existing one-line warning
**Evidence:** three separate failures in this project, all from this cause
**Type:** documentation gap, not a code defect

## What the docs say today

One sentence:

> ❗️ Missing global variables is the major cause that some third-party libraries
> designed for the web cannot work in the browser window.

That names the problem and stops. No list of which globals, no way to diagnose a
failure, no pattern for fixing it. The same page's sandbox section says the main
window "has window-specific APIs or variables (`window`, `document`)", implying
the sandbox does not, which is the closest thing to concrete guidance available.

## What this project ran into

Adding Cytoscape.js, a mainstream browser library, produced three distinct
failures, each opaque:

**1. `console` at module top level aborts plugin startup.** Cytoscape's CJS
bundle evaluates `var warnSupported = console.warn != null;` at the top level.
With no `console` in scope, importing it throws during module evaluation, which
aborts `startup()`. The plugin still appears in Tools → Plugins, so it looks
installed and does nothing.

**2. A bare `document` silently breaks interaction.** Cytoscape's
`blurActiveDomElement()` references bare `document` rather than
`container.ownerDocument`. It runs on every mousedown, so pan and tap die while
wheel-zoom keeps working, since zoom takes a different path. A partially working
graph is much harder to reason about than a broken one.

**3. A missing `ResizeObserver` fails without throwing.** Cytoscape checks for it
and silently skips container-size tracking. The graph renders, and then never
notices a pane splitter or sidebar toggle resizing its container, so cached
bounds go stale and hit-testing drifts.

Diagnosing all three required reading the bundled library source in
`node_modules/<pkg>/dist/*.js` at the failing line. None of them produced a
useful stack, and two produced no output at all.

## The wrinkle worth documenting most

Plain assignment does not always work. In at least one of this plugin's
execution scopes, `document`, `Image`, `ResizeObserver` and `MutationObserver`
are already present as getter-only, non-configurable properties rather than being
absent. `typeof globalThis.document` returns `"object"`, so a guard written as
`if (typeof g.document === "undefined")` never fires, and

```js
globalThis.document = someWindow.document;
```

throws `TypeError: setting getter-only property "document"`.

So the situation is worse than "the global is missing". Third-party code assumes
either that a global is absent and can be defined, or that it is present and
usable. Depending on scope, Zotero can present a third case: present, wrong for
your purposes, and not replaceable by assignment.

The honest statement of what we know: presence varies by execution scope, and at
least one scope pre-defines these as non-configurable accessors. The full
per-scope matrix (bootstrap sandbox vs main-window scope vs a plugin bundle
loaded into either) was not mapped systematically, and it may differ by Zotero
version. Anyone writing this page should verify each cell with
`Object.getOwnPropertyDescriptor` rather than copying the claim from here.

## What the page should contain

1. The globals a bundled library is likely to reach for, and where each is and is
   not available: `console`, `document`, `window`, `Image`, `ResizeObserver`,
   `MutationObserver`, `fetch`, `localStorage`.
2. The two timing classes, because they need different fixes: module-evaluation
   time, which needs the shim imported before any other import, and runtime,
   which can be set up per window before the library is used.
3. `Object.defineProperty` versus assignment, and why checking the property
   descriptor comes first.
4. Reading the bundled source at the failing line as the primary diagnostic. This
   was the only technique that worked in all three cases.
5. The silent variants. A library that checks for a global and degrades quietly is
   harder to spot than one that throws, and the symptom (stale layout, dead
   interaction) does not look like a missing global.

## Cross-reference

The same docs recommend running Zotero with `-ZoteroDebugText` and `-jsconsole`
(`docs/main/your-first-zotero-plugin.md:61`), which the scaffold does not do; see
`scaffold-zotero-stdout-discarded`. Debugging any of the failures above is
noticeably harder without that output, so the two findings compound.

## Reusable material from this project

- `src/utils/consolePolyfill.ts`, a `Zotero.debug`-backed `console` imported as
  the first statement in `src/index.ts`
- `src/utils/cytoscapeGlobalsPolyfill.ts`, an idempotent per-window shim that
  defines only genuinely missing globals and reads them through a mutable
  host-window reference so a second main window does not keep using the first
  one's document
