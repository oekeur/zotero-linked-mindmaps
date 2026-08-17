# Unsubstituted `__placeholder__` tokens ship in the built manifest

**Repo:** `zotero-plugin-dev/zotero-plugin-scaffold`
**Location:** `src/core/builder/replace.ts`, `replaceDefine`
**Evidence:** reproduced here, build exits 0 with the placeholder in the `.xpi`
**Severity:** silent at build time, fails at install time with a confusing error

## What the code does

`replaceDefine` builds its replacement map from the keys present in `define`:

```ts
const replaceMap = new Map(
  Object.keys(define).map((key) => [
    new RegExp(`__${key}__`, "g"),
    define[key],
  ]),
);
```

Anything the template wrote as `__key__` for which `define` has no `key` is
left in place. Nothing scans the output afterwards.

The template's `addon/manifest.json` contains six such tokens, one of them
`"homepage_url": "__homepage__"`, fed from `package.json#homepage`. That field
is optional in npm's own schema and easy to omit.

## What happens when a field is missing

`npm run build` prints `✔ Build finished`, exits 0, and produces an `.xpi`
whose `manifest.json` reads `"homepage_url": "__homepage__"`. `tsc --noEmit`
sees nothing, since the manifest is not TypeScript. The plugin then fails at
install time inside Zotero's extension machinery:

```
Error processing homepage_url: TypeError: URL constructor: __homepage__ is not a valid URL
```

The message names `homepage_url`, which is a manifest key, not the
`package.json` field the author has to edit, and it arrives at the point
furthest from the cause. This project spent a debugging cycle on it and the
workaround is now recorded in CLAUDE.md's verification protocol, which is a bad
sign: a build-time check would have made the note unnecessary.

## Why a scan is the right fix rather than validating `homepage` specifically

The token convention is generic. `homepage` is the one that bit this project,
but the same hole exists for any `__key__` the template author adds and forgets
to define, in any file under `dist/addon`, including `.ftl`, `.css` and
`.xhtml`. A single post-replace scan for a leftover `__[A-Za-z0-9_]+__` covers
the whole class and needs no per-field knowledge.

Placeholders are a closed convention here: `replaceDefine` globs
`${dist}/addon/**/*`, so anything matching the token shape after replacement is
by definition unsubstituted.

## False-positive risk

A legitimate `__something__` in shipped source would trip the scan. Two things
limit that: this runs over `dist/addon`, which is assets plus the bundled
script, and JavaScript identifiers of that shape are rare in plugin assets.
The safe form is a warning listing file, line and token, promoted to an error
only for files the scaffold itself templated. If maintainers want it strict,
gating with a config flag (default warn) keeps it non-breaking.

## Pairs with

`scaffold-parse-repo-url`. Both are build-time validation of values derived
from `package.json`, both currently surface far from the cause, and one PR can
carry both.
