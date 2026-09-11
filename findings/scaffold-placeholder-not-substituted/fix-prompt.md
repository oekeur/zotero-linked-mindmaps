# Agent prompt: detect unsubstituted placeholders after build

You are adding a build-time check to
`zotero-plugin-dev/zotero-plugin-scaffold`. Read `analysis.md` and
`reproduction.md` in this directory first; `reproduction.md` has the exact
commands and output that demonstrate the gap.

## Task

`replaceDefine` (`src/core/builder/replace.ts`) leaves `__key__` tokens in the
build output when `define` has no matching key. Nothing detects this, so the
build reports success and the packaged `.xpi` ships a literal placeholder that
Zotero rejects at install time. Add a post-replacement scan that reports
leftover tokens.

## Steps

1. Read `src/core/builder/replace.ts` in full, then find where `replaceDefine`
   is called from the build pipeline (`src/core/builder/index.ts`). Note the
   ordering relative to packaging: the scan has to run after replacement and
   before the `.xpi` is zipped, or a failing build still leaves an artifact.
2. Read `src/core/builder/manifest.ts` too. It merges the manifest separately
   from token replacement, so confirm which step writes the final
   `homepage_url` value before deciding where the scan belongs.
3. Implement the scan over the same glob `replaceDefine` uses
   (`${dist}/addon/**/*`), matching `__[A-Za-z0-9_]+__`. Report file path, line
   number and the token. Reuse the existing `logger` rather than `console`.
4. Default to a warning. Add a config option so a project can make it fail the
   build, and follow the existing option conventions in `src/types/config.ts`,
   including the bilingual doc comments used there.
5. Skip binary files. The glob matches images and fonts under `content/`, so
   read as text only for extensions that can carry tokens, or guard on a
   text-detection check. Getting a spurious hit from a binary would make the
   warning noise and it would be ignored.
6. Add a vitest case next to the existing `src/core/builder/*.test.ts` files:
   given a temp dist containing a file with a token that `define` does not
   cover, the scan reports it; given full substitution, it stays quiet.

## Constraints

- Do not change `replaceDefine`'s existing behavior or signature. This is an
  additional check, not a rewrite of replacement.
- Warning by default keeps existing builds green, which matters because some
  projects may legitimately ship a `__something__` string. Do not make it an
  error unconditionally.
- Do not special-case `homepage`. The point is to cover the whole token class.

## Definition of done

- `npx vitest run` passes, including the new case.
- Reproducing `reproduction.md`'s failing case now prints a warning naming the
  file, line and `__homepage__`, and the build still exits 0 by default.
- With the new option enabled, the same build exits non-zero and no `.xpi` is
  left behind.
- The clean control case in `reproduction.md` produces no warning.
