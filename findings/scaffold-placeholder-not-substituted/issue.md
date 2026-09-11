**Title:** Build succeeds with unsubstituted `__placeholder__` tokens in the packaged manifest

### Summary

`replaceDefine` (`src/core/builder/replace.ts`) builds its replacement map from
the keys present in `define`, so any `__key__` token in `dist/addon` without a
matching key is left as-is. Nothing checks the output afterwards. Omitting an
optional `package.json` field therefore produces a green build and an `.xpi`
containing a literal placeholder, and the failure surfaces only when Zotero
tries to install it.

### Reproduction

`zotero-plugin-scaffold` 0.8.8. Remove `homepage` from `package.json`, which npm
treats as optional, and build:

```
$ npx zotero-plugin build
 ℹ Building version 0.1.0 to .scaffold/build ... in production mode.
   → Preparing static assets
   → Bundling scripts
   → Packing plugin
 ✔ Build finished in 0.214 s.

$ echo $?
0

$ grep -n homepage_url .scaffold/build/addon/manifest.json
6:  "homepage_url": "__homepage__",

$ unzip -p .scaffold/build/*.xpi manifest.json | grep homepage_url
  "homepage_url": "__homepage__",
```

Restoring `homepage` substitutes correctly, so the missing field is the whole
cause.

Installing that `.xpi` fails inside Zotero with:

```
Error processing homepage_url: TypeError: URL constructor: __homepage__ is not a valid URL
```

That message names `homepage_url`, a manifest key, rather than
`package.json#homepage`, the field the author has to add, and it arrives one
build-plus-install cycle away from the cause.

### Why this is worth a generic fix

The token convention is generic, so the hole is not specific to `homepage`. The
template's `addon/manifest.json` carries seven such tokens (`__addonName__`,
`__buildVersion__`, `__description__`, `__homepage__`, `__author__`,
`__addonID__`, `__updateURL__`), and because `replaceDefine` globs
`${dist}/addon/**/*`, templated `.ftl`, `.css` and `.xhtml` assets are exposed
the same way. One scan covers all of it without per-field knowledge.

### Suggested fix

After `replaceDefine` runs, scan `${dist}/addon/**/*` for any remaining
`__[A-Za-z0-9_]+__` and report file, line and token. Warning by default is
enough to close the gap; a config flag can make it an error for projects that
want the build to fail. Since the scan runs over `dist`, a match is by
definition a token that replacement did not handle.

### Environment

`zotero-plugin-scaffold` 0.8.8, node 24, Linux. `replaceDefine` unchanged at
`HEAD` on 2026-08-17.
