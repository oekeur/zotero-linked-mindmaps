# Agent prompt: default `data` in Zotero_Tabs.add

You are proposing a change to `zotero/zotero`, a large upstream project with its
own review culture. Read `analysis.md` and `reproduction.md` in this directory
first. Keep the change minimal; this is a two-line fix that has to survive
review by people who know this code far better than you do.

## Task

`Zotero_Tabs.add()` in `chrome/content/zotero/tabs.js` does not validate or
default the `data` option, and `_update()` dereferences it. A plugin omitting it
gets a TypeError from Zotero's own code and a half-registered tab. Default `data`
to `{}`.

## Steps

1. Read `chrome/content/zotero/tabs.js` around `add()` (line ~636) and all of
   `_update()` (lines ~330-400). Confirm for yourself that no default is applied
   anywhere between the two, and note every place `tab.data` is read.
2. Find every internal caller of `Zotero_Tabs.add`. Grep the whole tree, not just
   `tabs.js`: reader tabs, note tabs and the library tab all go through it.
   Confirm they all pass a real object, so a default changes nothing for them.
3. Check `restoreState` and `getState`, which serialise tabs into
   `session.json`. Confirm a defaulted `{}` round-trips without changing what is
   persisted for existing tabs, and that a restored tab with `data: {}` does not
   hit a different unguarded read.
4. Make the change where `title` is defaulted, so the validation block stays
   grouped:

   ```js
   if (!data) {
     data = {};
   }
   ```

5. Decide separately whether to touch the empty `if (typeof type != 'string') {}`
   block on line 637. It is the same class of gap, but filling it in with a throw
   is a behavior change that could break an existing plugin passing something
   odd. Recommend it in the PR description rather than bundling it, unless the
   surrounding code makes the intent unambiguous.
6. Follow the project's contribution process: check `CONTRIBUTING`, match the
   file's existing style (tabs, `var`, the phrasing of nearby error messages), and
   describe the plugin-facing symptom in the PR, since that is the motivation a
   reviewer needs.

## Constraints

- Two lines. Do not refactor `_update()`, do not add guards at each `tab.data`
  read, do not restructure the validation block.
- Do not change behavior for any existing internal caller.
- Do not bundle the `type` check unless you have made the case for it separately.

## Definition of done

- `Zotero_Tabs.add({ type, title, select: true })` with no `data` creates a
  working tab instead of throwing.
- Every existing internal caller behaves identically.
- Session save and restore are unaffected for existing tab types.
- The PR names the plugin-facing symptom and the exact `_update()` lines that
  read `tab.data`.
