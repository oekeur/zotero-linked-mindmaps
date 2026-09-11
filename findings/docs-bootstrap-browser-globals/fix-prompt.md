# Agent prompt: write the docs page on bundling browser-targeted libraries

You are writing a documentation page for
`windingwind/doc-for-zotero-plugin-dev`, a VitePress site. Read `analysis.md` and
`reproduction.md` in this directory first.

This is a writing task with a verification requirement: most of the value is in
the per-scope facts, and those must be measured, not transcribed from the notes
here.

## Task

Expand the one-line warning at `docs/main/privileged-vs-unprivileged.md:43`
("Missing global variables is the major cause...") into actionable guidance on
using npm libraries written for browsers inside a Zotero plugin.

## Steps

1. Read the existing page in full so the new material fits its structure and
   voice. Decide whether this belongs as a section there or as a new page linked
   from it. A new page is probably right, since the existing one is about the
   security model rather than about bundling, but check the sidebar config
   (`docs/.vitepress/config.ts`) and the reading order before deciding.
2. Build the per-scope table by measurement. For each of `console`, `document`,
   `window`, `Image`, `ResizeObserver`, `MutationObserver`, `fetch` and
   `localStorage`, and for each scope (the bootstrap sandbox, the main-window
   scope, and a bundled script loaded into each), record what
   `Object.getOwnPropertyDescriptor(globalThis, name)` actually returns. Do not
   copy the claims in `analysis.md`; they were observed on one Zotero version in
   one project and the notes say so explicitly. State the Zotero version you
   measured on in the page.
3. Cover the two timing classes as separate cases with separate examples:
   module-evaluation time, where the shim has to be the first import, and runtime,
   where a per-window shim runs before the library is constructed. Readers get
   this wrong in a way that produces a working plugin that breaks on the second
   window.
4. Cover `Object.defineProperty` versus assignment, including why
   `typeof x === "undefined"` is the wrong guard when the property exists as a
   getter, and why the descriptor has to be checked first.
5. Write the diagnosis section. The technique that worked for every case in
   `reproduction.md` was reading the bundled library source in
   `node_modules/<pkg>/dist/*.js` at the failing line. Include the silent variants:
   a library that checks for a global and degrades quietly produces a symptom
   (stale layout, dead interaction, a partially working widget) that does not look
   like a missing global.
6. Use the Cytoscape failures as the worked examples. They are concrete, they are
   from a mainstream library, and all three symptoms differ. Cite line numbers with
   the package version, since bundled line numbers move between releases.
7. Run the site build. `docs:build` fails on dead links, so use it rather than
   eyeballing the markdown; it catches bare-filename links that a manual read
   misses.

## Constraints

- Match the existing docs' voice: short, direct, with the callout blocks the site
  already uses. Do not introduce a different heading convention.
- Do not present unverified claims as fact. Where you could not measure something,
  say what you did not check rather than hedging the whole page.
- Keep the code samples runnable and minimal. A reader should be able to paste the
  shim into `src/utils/` and have it work.
- Note the docs' own caveat that content can lag Zotero itself, and cross-check
  anything surprising against Zotero's source.

## Definition of done

- The per-scope table is measured, with the Zotero version stated.
- Both timing classes have their own example.
- The descriptor-versus-assignment trap is explained with the failing guard shown.
- All three Cytoscape symptoms appear, with versioned line references.
- `docs:build` passes with no dead links.
