# Reproduction

Environment: this repo, `zotero-plugin-scaffold` 0.8.8, node 24, Linux.

## Failing case: omit `homepage` from package.json

Starting state, `package.json` has:

```json
"homepage": "https://github.com/oekeur/zotero-linked-mindmaps",
```

Remove that field, leaving everything else untouched:

```
$ node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.homepage;fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
```

Build:

```
$ npx zotero-plugin build
 ℹ Building version 0.1.0 to .scaffold/build at 2026-08-17 11:24:57 in production mode.
   → Preparing static assets
   → Bundling scripts
   → Packing plugin
 ✔ Build finished in 0.214 s.

$ npx zotero-plugin build >/dev/null 2>&1; echo "exit code: $?"
exit code: 0
```

The build reports success. Inspect what it produced:

```
$ grep -n "homepage_url\|__" .scaffold/build/addon/manifest.json
6:  "homepage_url": "__homepage__",
```

And the packaged artifact, which is what a user installs:

```
$ unzip -p .scaffold/build/*.xpi manifest.json | grep homepage_url
  "homepage_url": "__homepage__",
```

So a green build ships an `.xpi` containing a manifest value that is not a URL.

## Control case: restore the field

```
$ git checkout package.json
$ npx zotero-plugin build >/dev/null 2>&1
$ grep -n "homepage_url" .scaffold/build/addon/manifest.json
6:  "homepage_url": "https://github.com/oekeur/zotero-linked-mindmaps",
```

Substitution works when the field is present, which isolates the cause to the
missing `package.json#homepage` and nothing else.

## Downstream failure

Installing the `.xpi` built without `homepage`, or running `npm start` against
it, fails inside Zotero's extension machinery:

```
Error processing homepage_url: TypeError: URL constructor: __homepage__ is not a valid URL
```

This part is quoted from the earlier debugging session in this project rather
than re-run here, because it needs a live Zotero install cycle. The build-side
evidence above is what the fix needs to act on, and that was reproduced
directly.

## Scope check

`addon/manifest.json` in the upstream template carries six tokens of this shape:

```
"name": "__addonName__"
"version": "__buildVersion__"
"description": "__description__"
"homepage_url": "__homepage__"
"author": "__author__"
"id": "__addonID__"
"update_url": "__updateURL__"
```

Any of them can go unsubstituted the same way if the corresponding `define` key
is absent, and `replaceDefine` globs `${dist}/addon/**/*`, so the same applies
to templated `.ftl`, `.css` and `.xhtml` assets.
