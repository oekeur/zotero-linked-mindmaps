# Reproduction

Two parts: the end-to-end failure from a real build, and a table showing which
URL forms the regex accepts.

## Part 1: a valid SSH-form repository URL breaks `build`

Environment: this repo, `zotero-plugin-scaffold` 0.8.8, node 24.

Set `repository.url` to the SSH form that `git remote -v` reports for an
SSH clone:

```jsonc
// package.json
"repository": {
  "type": "git",
  "url": "git@github.com:oekeur/zotero-linked-mindmaps.git"
}
```

Then run a build that touches no remote at all:

```
$ npx zotero-plugin build
 ERROR  Error: Parse repository URL failed.
Error: Parse repository URL failed.
    at parseRepoUrl (file:///.../node_modules/zotero-plugin-scaffold/dist/shared/scaffold-replace-Dn0wBA9W.mjs:207:20)
    at resolveConfig$1 (file:///.../node_modules/zotero-plugin-scaffold/dist/shared/scaffold-src-bWcaMVyt.mjs:57:26)
    at Object.loadConfig$1 [as loadConfig] (file:///.../node_modules/zotero-plugin-scaffold/dist/shared/scaffold-src-bWcaMVyt.mjs:45:9)
    at async runCommand (file:///.../node_modules/zotero-plugin-scaffold/dist/cli.js:84:36)
    at async Command.<anonymous> (file:///.../node_modules/zotero-plugin-scaffold/dist/cli.js:54:3)

$ echo $?
1
```

The message names no field. Every frame in the stack is inside
`node_modules/zotero-plugin-scaffold/dist`, so nothing points at
`package.json#repository.url` as the input to change.

Restoring the `git+https://...git` form makes the build pass again, which
isolates the cause to the URL form alone.

## Part 2: which forms the regex accepts

The regex was copied verbatim from `src/utils/string.ts:49` into a standalone
script and run against realistic URL forms:

```js
const RE = /:\/\/.+com\/([^/]+)\/([^.]+)\.git$/;
```

```
OK     git+https://github.com/oekeur/zotero-linked-mindmaps.git   owner=oekeur repo=zotero-linked-mindmaps
OK     https://github.com/owner/repo.git                          owner=owner repo=repo
THROW  https://github.com/owner/repo
THROW  git@github.com:owner/repo.git
OK     ssh://git@github.com/owner/repo.git                        owner=owner repo=repo
THROW  https://gitlab.org/owner/repo.git
THROW  https://git.example.dev/owner/repo.git
THROW  https://codeberg.org/owner/repo.git
THROW  https://github.com/owner/repo.js.git
THROW  https://github.com/owner/my.plugin.git
THROW  https://github.com/owner/repo.git/
OK     https://gitlab.com/group/subgroup/repo.git                 owner=group repo=subgroup/repo
OK     https://gitlab.com/owner/repo.git                          owner=owner repo=repo
```

Seven of thirteen realistic forms throw. The GitLab subgroup case is the worst
outcome: it succeeds and returns `repo=subgroup/repo`, a value that then gets
interpolated into `updateURL` and `xpiDownloadLink`, so the breakage moves from
build time to whatever consumes the published `update.json`.

The last row parses cleanly and still produces wrong output, because the
default templates hardcode `https://github.com/...` regardless of host.

## Script used

```js
const RE = /:\/\/.+com\/([^/]+)\/([^.]+)\.git$/;
const urls = [
  "git+https://github.com/oekeur/zotero-linked-mindmaps.git",
  "https://github.com/owner/repo.git",
  "https://github.com/owner/repo",
  "git@github.com:owner/repo.git",
  "ssh://git@github.com/owner/repo.git",
  "https://gitlab.org/owner/repo.git",
  "https://git.example.dev/owner/repo.git",
  "https://codeberg.org/owner/repo.git",
  "https://github.com/owner/repo.js.git",
  "https://github.com/owner/my.plugin.git",
  "https://github.com/owner/repo.git/",
  "https://gitlab.com/group/subgroup/repo.git",
  "https://gitlab.com/owner/repo.git",
];
for (const u of urls) {
  const m = u.match(RE);
  console.log(
    (m ? "OK   " : "THROW") +
      "  " +
      u.padEnd(54) +
      (m ? `owner=${m[1]} repo=${m[2]}` : ""),
  );
}
```
