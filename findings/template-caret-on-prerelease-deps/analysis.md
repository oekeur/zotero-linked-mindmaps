# Caret ranges on prerelease dependencies admit breaking betas

**Repo:** `windingwind/zotero-plugin-template`
**Location:** `package.json`, `zotero-plugin-toolkit` and `zotero-types`
**Evidence:** semver behavior reproduced; drift confirmed against the npm registry
**Severity:** low. Narrower than it first looked, because the template ships a lockfile

## The ranges

At upstream HEAD:

```json
"dependencies": {
  "zotero-plugin-toolkit": "^5.1.0-beta.13"
},
"devDependencies": {
  "zotero-plugin-scaffold": "^0.8.2",
  "zotero-types": "^4.1.0-beta.4"
}
```

A caret on a prerelease is a wider range than it looks. It admits every later
prerelease of the same version tuple, and then all subsequent minor and patch
releases:

```
^5.1.0-beta.13 satisfies 5.1.0-beta.14 => true
^5.1.0-beta.13 satisfies 5.1.0-beta.99 => true
^5.1.0-beta.13 satisfies 5.1.0         => true
^5.1.0-beta.13 satisfies 5.2.0         => true
^5.1.0-beta.13 satisfies 5.9.9         => true
^5.1.0-beta.13 satisfies 6.0.0         => false
```

Prerelease versions are prerelease precisely because they are allowed to break.
Accepting all of them by range is the opposite of what a `-beta.13` pin usually
means to whoever wrote it.

## The drift is real

Both packages have published since the template's pins. Toolkit is now at 5.2.0
and zotero-types at 4.1.3, and every intermediate release satisfies the template's
ranges. See `reproduction.md` for the version lists.

## Where it bites, and where it does not

Important correction to how this was first framed. The template ships
`package-lock.json`, so a plain `git clone` plus `npm install` gets 5.1.0-beta.13
and 4.1.0-beta.4, the versions the template was authored against. The carets are
inert on that path, and the same is true of GitHub's "Use this template", which
copies the lockfile.

It bites where the lockfile does not come along:

- a scaffolding tool or manual copy that takes `package.json` and regenerates the
  lock, which is how this project was set up and how it hit the problem
- `npm run update-deps`, which the template itself provides as
  `npm update --save`, and which walks straight up to the top of the caret range
  and across beta boundaries
- Dependabot or Renovate on a fork, resolving within range
- any `npm install <other-package>` that triggers a re-resolution

In this project the result was that `tsc --noEmit` failed on the template's own
example code, because the newer beta had renamed exports and tightened types. The
fix was to pin both to the versions in the template's lockfile.

## Suggested fix

Pin exact versions, or use `~`, while the dependency is on a prerelease line:

```json
"zotero-plugin-toolkit": "5.1.0-beta.13",
"zotero-types": "4.1.0-beta.4"
```

Renovate or Dependabot can raise the pin deliberately, with CI proving the bump.
That is strictly better than a range that upgrades silently across releases
allowed to break.

The `^0.8.2` on `zotero-plugin-scaffold` has the same shape of problem for a
different reason: under semver, `0.x` minor bumps may break, and `^0.8.2` allows
`0.9.0`. Worth pinning for the same reason, though it is not a prerelease case.

## Honest assessment of severity

Low. The lockfile covers the most common path, and the fix on the consumer side
is one line. It is filed because the failure mode is confusing out of proportion
to its size: the symptom is the template's own example code failing to type-check
in a fresh project, which reads as "the template is broken" rather than "your
resolved dependency versions differ from the ones it was written against".
