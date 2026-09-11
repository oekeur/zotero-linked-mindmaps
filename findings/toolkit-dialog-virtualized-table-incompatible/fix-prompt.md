# Agent prompt: stop VirtualizedTableHelper failing silently in a DialogHelper window

You are fixing a silent failure in `windingwind/zotero-plugin-toolkit`. Read
`analysis.md` and `reproduction.md` in this directory first.

## Task

`VirtualizedTableHelper`'s constructor reads `win.require` with no guard.
`DialogHelper` opens its windows on `about:blank`, which has no `require`, so
combining the two throws `TypeError: _require is not a function` on an async
path where nothing surfaces it. The dialog opens and the table silently never
renders.

Deliver the guard. Investigate the real fix and report on it, but do not ship a
half-working cross-window rendering path.

## Steps

1. Read the toolkit's source for both helpers. In the repo that is
   `src/helpers/virtualizedTable.ts` and `src/helpers/dialog.ts`; if the layout
   differs, find them by grepping for `win.require` and `about:blank`. Do not
   work from the bundled `dist` output except to cross-check.
2. Add the guard in `VirtualizedTableHelper`'s constructor, before the first
   `require` call. Throw an `Error` that states what is required (a window with
   Zotero's module loader), what was passed (a window without one), and the
   concrete cause (`DialogHelper` windows are `about:blank` popups). Someone
   reading only the message should know what to do next.
3. Check whether other helpers in the library call `win.require` or otherwise
   assume a chrome window. Grep for `.require(` across `src/`. If more than one
   helper has the same assumption, apply the same guard consistently rather than
   fixing one instance.
4. Investigate whether the combination can be made to work: resolving React and
   `components/virtualized-table` from `Zotero.getMainWindow()` while rendering
   into the dialog document. Try it, and specifically check event handling,
   scrolling and unmount, not just whether something paints. React across
   documents is fragile. Report what you find. If it works cleanly, propose it as
   a second commit or a separate PR so the guard can land on its own.
5. Add or update docs for both helpers noting the constraint, wherever the repo
   keeps helper documentation.
6. Add a test if the repo's setup allows constructing the helper with a stub
   window. A plain object without `require` is enough to assert the new error;
   that needs no live Zotero.

## Constraints

- The guard must not change behavior for the working case, a chrome window with
  `require`.
- Do not swallow the error or fall back to a degraded table. A thrown error is
  the point; silence is the bug.
- Do not change `DialogHelper` to stop using `about:blank` as part of this
  change. That is a larger decision with its own compatibility surface.

## Definition of done

- Constructing `VirtualizedTableHelper` with a window lacking `require` throws an
  error naming the cause, synchronously, at construction.
- The `reproduction.md` snippet now produces a visible, explanatory error instead
  of an empty container.
- Existing usage on Zotero's main window is unaffected.
- Findings on the cross-window approach written up in the PR, whichever way they
  came out.
