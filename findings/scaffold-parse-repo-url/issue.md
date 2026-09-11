**Title:** `parseRepoUrl` rejects valid `repository.url` forms and silently mis-parses nested paths

### Summary

`parseRepoUrl` (`src/utils/string.ts:42-54`) matches `repository.url` against
`/:\/\/.+com\/([^/]+)\/([^.]+)\.git$/`. That pattern rejects several ordinary
URL forms, mis-parses nested group paths without erroring, and reports both
failure modes with the same message, `Parse repository URL failed.`, which
names neither the field nor the expected format. Because `resolveConfig` calls
it during config load, a rejected URL blocks `build`, `serve` and `test`, not
just `release`.

### Reproduction

With `zotero-plugin-scaffold` 0.8.8, set the SSH form that `git remote -v`
reports for an SSH clone:

```jsonc
"repository": { "type": "git", "url": "git@github.com:owner/repo.git" }
```

```
$ npx zotero-plugin build
 ERROR  Error: Parse repository URL failed.
    at parseRepoUrl (.../zotero-plugin-scaffold/dist/shared/scaffold-replace-Dn0wBA9W.mjs:207:20)
    at resolveConfig$1 (.../scaffold-src-bWcaMVyt.mjs:57:26)
    at Object.loadConfig$1 [as loadConfig] (.../scaffold-src-bWcaMVyt.mjs:45:9)
$ echo $?
1
```

Every stack frame is inside `node_modules`, so nothing indicates that
`package.json#repository.url` is the input to change.

Running the regex directly over realistic forms:

| URL                                          | Result                   |
| -------------------------------------------- | ------------------------ |
| `git+https://github.com/owner/repo.git`      | ok                       |
| `https://github.com/owner/repo.git`          | ok                       |
| `https://github.com/owner/repo`              | throws                   |
| `git@github.com:owner/repo.git`              | throws                   |
| `https://gitlab.org/owner/repo.git`          | throws                   |
| `https://git.example.dev/owner/repo.git`     | throws                   |
| `https://codeberg.org/owner/repo.git`        | throws                   |
| `https://github.com/owner/repo.js.git`       | throws                   |
| `https://github.com/owner/my.plugin.git`     | throws                   |
| `https://github.com/owner/repo.git/`         | throws                   |
| `https://gitlab.com/group/subgroup/repo.git` | ok, `repo=subgroup/repo` |

### Three distinct problems

1. **Rejects valid forms.** The pattern requires a `://` separator, a host
   ending in `com`, a trailing `.git`, and a repo segment with no dot. SSH
   remotes, non-`.com` hosts, `.git`-less URLs and dotted repo names all fail.
2. **Mis-parses without erroring.** `[^.]+` lets the repo group span a slash, so
   a GitLab subgroup URL yields `repo=subgroup/repo`. That value is
   interpolated into `updateURL` and `xpiDownloadLink`, moving the breakage into
   the published `update.json`.
3. **Unactionable error.** Both throw sites share one string with no field name,
   no offending value and no expected format.

### Related, same area

For a URL that does parse, the defaults hardcode the host:

```ts
xpiDownloadLink: "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",
updateURL: "https://github.com/{{owner}}/{{repo}}/releases/download/release/{{updateJson}}",
```

A `gitlab.com` repository therefore parses and then gets `github.com` update
URLs. Overridable, but wrong by default and silent.

### Suggested fix

Use `hosted-git-info` to parse, which covers SSH, `git+https`, shorthand and
optional `.git`, and exposes the host so the default templates can branch on it.
If a new dependency is unwelcome, then at minimum accept SSH and scp-like
forms, any TLD, optional `.git` and dotted repo names; anchor the repo segment
so it cannot span a slash; and include the field name, the value found and the
expected shape in the error.

### Environment

`zotero-plugin-scaffold` 0.8.8, node 24, Linux. Regex verified unchanged at
`HEAD` on 2026-08-17.
