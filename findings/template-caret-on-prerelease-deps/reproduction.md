# Reproduction

## The ranges, at upstream HEAD

```
$ gh api repos/windingwind/zotero-plugin-template/contents/package.json \
    -H "Accept: application/vnd.github.raw" \
    | grep -n "zotero-plugin-toolkit\|zotero-types\|zotero-plugin-scaffold"
33:    "zotero-plugin-toolkit": "^5.1.0-beta.13"
45:    "zotero-plugin-scaffold": "^0.8.2",
46:    "zotero-types": "^4.1.0-beta.4"
```

## What the caret actually admits

```
$ node -e "const s=require('semver'); for (const v of ['5.1.0-beta.14','5.1.0-beta.99','5.1.0','5.2.0','5.9.9','6.0.0']) console.log('^5.1.0-beta.13 satisfies', v, '=>', s.satisfies(v,'^5.1.0-beta.13'));"
^5.1.0-beta.13 satisfies 5.1.0-beta.14 => true
^5.1.0-beta.13 satisfies 5.1.0-beta.99 => true
^5.1.0-beta.13 satisfies 5.1.0 => true
^5.1.0-beta.13 satisfies 5.2.0 => true
^5.1.0-beta.13 satisfies 5.9.9 => true
^5.1.0-beta.13 satisfies 6.0.0 => false
```

Every later beta of the same tuple qualifies, and so does every 5.x release.

## The drift exists

```
$ npm view zotero-plugin-toolkit versions --json | ... filter 5.x
5.0.0-0 5.0.0-1 5.0.0 5.0.1 5.1.0-0 5.1.0-1 5.1.0-2 5.1.0-beta.0 5.1.0-beta.3
5.1.0-beta.4 5.1.0-beta.5 5.1.0-beta.6 5.1.0-beta.7 5.1.0-beta.8 5.1.0-beta.9
5.1.0-beta.10 5.1.0-beta.11 5.1.0-beta.12 5.1.0-beta.13 5.1.0-beta.14
5.1.1 5.1.2 5.1.3 5.1.4 5.2.0

$ npm view zotero-types versions --json | ... filter 4.x
4.0.0-beta.0 ... 4.0.5 4.1.0-beta.0 4.1.0-beta.1 4.1.0-beta.2 4.1.0-beta.3
4.1.0-beta.4 4.1.0-beta.8 4.1.1 4.1.2 4.1.3
```

So a re-resolution today moves toolkit from 5.1.0-beta.13 to 5.2.0 and zotero-types
from 4.1.0-beta.4 to 4.1.3, both inside the declared ranges.

## Why the impact is narrower than it looks

The template ships a lockfile:

```
$ gh api repos/windingwind/zotero-plugin-template/contents/ --jq '.[].name' | grep lock
package-lock.json

$ gh api repos/windingwind/zotero-plugin-template/contents/package-lock.json \
    -H "Accept: application/vnd.github.raw" | ... extract versions
node_modules/zotero-plugin-scaffold => 0.8.2
node_modules/zotero-plugin-toolkit => 5.1.0-beta.13
node_modules/zotero-types => 4.1.0-beta.4
```

`git clone` plus `npm install` therefore gets the authored versions and the carets
never come into play. Same for GitHub's "Use this template", which copies the
lockfile.

This corrects an earlier framing of this finding, which claimed a fresh clone
would drift. It will not.

## The paths where it does bite

- a scaffolding flow or manual file copy that takes `package.json` without the
  lockfile and resolves fresh, which is how this project was set up
- `npm run update-deps`, a script the template itself provides, defined as
  `npm update --save`, which walks to the top of each caret range and across beta
  boundaries
- Dependabot or Renovate resolving within range on a fork
- any later `npm install <pkg>` that re-resolves the tree

## Observed consequence in this project

After scaffolding, `tsc --noEmit` failed on the template's own example code with
renamed exports and tightened types from a newer beta than the template was
written against. Fixed by pinning both packages to the exact versions from the
template's lockfile, which is why this repo's `package.json` carries
`"zotero-plugin-toolkit": "5.1.0-beta.13"` and `"zotero-types": "4.1.0-beta.4"`
with no caret.

Not re-run for this write-up. Doing so cleanly would mean installing the upstream
template with the lockfile deleted and type-checking it, which is worth doing
before opening the issue if the maintainers push back on the severity.
