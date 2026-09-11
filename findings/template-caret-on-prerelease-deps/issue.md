**Title:** Caret ranges on prerelease deps let a re-resolved tree pick up breaking betas

### Summary

`package.json` declares `zotero-plugin-toolkit: ^5.1.0-beta.13` and
`zotero-types: ^4.1.0-beta.4`. A caret on a prerelease admits every later
prerelease of the same tuple plus all later minors:

```
^5.1.0-beta.13 satisfies 5.1.0-beta.14 => true
^5.1.0-beta.13 satisfies 5.1.0-beta.99 => true
^5.1.0-beta.13 satisfies 5.1.0         => true
^5.1.0-beta.13 satisfies 5.2.0         => true
^5.1.0-beta.13 satisfies 5.9.9         => true
```

Both packages have released since: toolkit is at 5.2.0, zotero-types at 4.1.3, and
every intermediate version satisfies the range. Prereleases are allowed to break,
so accepting all of them by range works against the intent of pinning `-beta.13`
in the first place.

### Scope, stated fairly

The template ships `package-lock.json`, so `git clone` plus `npm install` gets
5.1.0-beta.13 and 4.1.0-beta.4 and the carets are inert. "Use this template"
copies the lockfile too. This is not a problem for the common path.

It becomes a problem where the lockfile is not inherited:

- a scaffolding flow or manual copy that takes `package.json` and resolves fresh
- `npm run update-deps`, which the template provides as `npm update --save`, and
  which walks to the top of the range and across beta boundaries
- Dependabot or Renovate on a fork
- any later `npm install <pkg>` that re-resolves

### What we saw

Setting up a plugin from the template without inheriting the lockfile,
`tsc --noEmit` failed on the template's own example code: renamed exports and
tightened types from a newer beta. That reads as "the template is broken" rather
than "your resolved versions differ from the authored ones", which is what makes
it worth a small change.

### Suggested fix

Pin exact, or use `~`, while these are on prerelease lines:

```diff
-    "zotero-plugin-toolkit": "^5.1.0-beta.13"
+    "zotero-plugin-toolkit": "5.1.0-beta.13"
-    "zotero-types": "^4.1.0-beta.4"
+    "zotero-types": "4.1.0-beta.4"
```

Renovate or Dependabot can still raise the pin deliberately with CI proving the
bump, which is a better place for that decision than range resolution.

`zotero-plugin-scaffold: ^0.8.2` has a related shape: under semver a `0.x` minor
may break, and the caret allows `0.9.0`. Not a prerelease case, but worth the same
treatment.

### Environment

`windingwind/zotero-plugin-template@HEAD`, checked 2026-08-17. Registry versions
as of the same date.
