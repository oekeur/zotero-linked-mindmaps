# Agent prompt: make Zotero_Tabs.add's `data` required in zotero-types

You are fixing a typing bug in `windingwind/zotero-types`. Read `analysis.md`
and `reproduction.md` in this directory first.

## Task

`types/zoteroTabs.d.ts:38` declares `data?: any` on `Zotero_Tabs.add`. Zotero
dereferences `tab.data` without a guard, so omitting the field crashes. Make it
required.

## Steps

1. Read `types/zoteroTabs.d.ts` around the `Zotero_Tabs` interface. Check whether
   a `TabInstance` type in the same file already describes the stored tab shape,
   including `data`. If it does, keep the two consistent rather than typing
   `data` twice in different ways.
2. Verify the runtime contract yourself before changing anything, rather than
   trusting this write-up. Read `chrome/content/zotero/tabs.js` in the Zotero
   source: `add()` around line 636 and `_update()` around lines 340-385. Confirm
   that no default is applied anywhere between `add()` and the `tab.data.icon`
   read.
3. Decide the type. `data: object` is the minimum. If `_update()` and the
   session-restore path only ever read a known set of keys (`itemID`, `icon`,
   `secondViewState` appear in the source), a documented optional-property shape
   is more useful:

   ```ts
   data: { itemID?: number; icon?: string; secondViewState?: any; [key: string]: any };
   ```

   Pick one and justify it in the PR from what the source reads, not from
   guesswork.

4. Check whether making it required breaks existing consumers in the repo's own
   tests or examples. Grep the repo for `Tabs.add`.
5. Note in the PR that Zotero could also default `data` to `{}` in `add()`, and
   that this typing change is the fix that helps TypeScript users today
   regardless of whether Zotero changes.

## Constraints

- Do not widen anything else in the signature while you are in there.
- Do not add a runtime shim. This repo ships types only.
- If the maintainers prefer documenting over breaking, a required field is still
  the right call: the alternative is a signature that endorses a crash. Say so
  plainly in the PR rather than hedging with a comment.

## Definition of done

- `data` is required on `Zotero_Tabs.add`'s options.
- The repo's own type-check or build passes.
- The PR body cites the two Zotero source locations that prove the field is read
  without a guard.
