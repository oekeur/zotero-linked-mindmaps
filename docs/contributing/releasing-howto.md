# Cutting a release

A release is two GitHub releases, not one.

`v<version>` holds the built `.xpi`. Its download URL is what `update.json` points users at, and what anyone installing by hand clicks.

`release` is a single long-lived release, marked as a prerelease so it never shows up as "latest", whose only job is to host `update.json` and `update-beta.json`. Zotero's auto-updater reads `update.json` from a fixed URL, so that file has to live at an address that doesn't change from version to version. The built `manifest.json` carries that address as `update_url`, and `zotero-plugin.config.ts` builds both it and the `.xpi` download link from `repository.url` in `package.json`.

The `.xpi` and both JSON files are produced by `npm run build` into `.scaffold/build/`. Nothing is published from your machine.

## Release a new version

From a clean `main` that's up to date with origin:

```sh
npm run release
```

You get a prompt for the new version number. Pick one, confirm, and the rest runs unattended:

1. `package.json` is rewritten with the new version.
2. `npm run build` runs. It fails the release if it fails, before anything is committed.
3. The change is committed as `chore(publish): release v<version>`.
4. The commit is tagged `v<version>`.
5. Commit and tag are pushed to origin.

That's the whole local side. GitHub publishing is off when you run it yourself, because `release.github.enable` defaults to `"ci"`.

Pushing the tag triggers `.github/workflows/release.yml`, which calls `zotero-plugin-dev/workflows/.github/workflows/release-plugin.yml` and runs `npm run release` again, this time inside Actions. The scaffold detects CI and behaves differently: it sees the target version already equals the version in `package.json`, so it skips the commit, the tag and the push, runs the build, then creates the `v<version>` release with the `.xpi` attached and refreshes the JSON assets on the `release` release. The `GITHUB_TOKEN` comes from `secrets: inherit`; there's nothing to configure.

Watch the run under Actions. It takes a couple of minutes. When it's green, the release page has the `.xpi` on it.

To skip the prompt, name the bump on the command line:

```sh
npm run release -- minor -y
```

`major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease` and explicit version numbers all work.

## Release a beta

```sh
npm run release -- prerelease --preid beta
```

Anything with a `-` in the version is treated as a prerelease throughout. The GitHub release is flagged as a prerelease, the build writes only `update-beta.json` and leaves the existing `update.json` alone, and the `update_url` baked into that build's manifest points at `update-beta.json`. So a beta build only ever offers updates to people who installed a beta build. Stable installs don't see it.

## The 0.1.0 case: tagging a version that's already in package.json

The scaffold refuses to commit, tag or push when the version you ask for is the version already in `package.json`. That's the right call in CI and an obstacle exactly once, on the first release, where `package.json` has said `0.1.0` since before there were any tags.

Tag it by hand instead. The tag has to point at a commit that already contains `.github/workflows/release.yml`, or the push won't trigger anything:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The workflow then runs the same way it would for any other tag.

There's no previous tag to diff against, so the auto-generated notes for this one cover the entire history, grouped by commit type. That's what v0.1.0 shipped with. Trim it on the release page if you'd rather it read as a summary.

## Where the changelog comes from

`zotero-plugin release` diffs the new tag against the previous tag and groups the commits by conventional-commit type. It drops the `chore(publish): release ...` commit itself. Commits that don't parse as conventional commits fall through as a plain list, which is a good reason to keep the commit convention (see [development-setup.md](./development-setup.md)).

You can't edit the notes before they're posted. Edit them on GitHub afterwards.

## When it goes wrong

**The build failed during `npm run release`.** `package.json` is left bumped and uncommitted, nothing else happened. Fix the build, then either commit the bump yourself and tag by hand, or `git checkout package.json` and start over.

**The tag pushed but no workflow ran.** The tag points at a commit without `release.yml` in it, or the tag doesn't match `v*`. Delete the tag locally and on origin, then re-tag a commit that has the workflow.

**The workflow ran but the release is missing its `.xpi`.** Read the Actions log. The scaffold throws `No xpi file found, are you sure you have run build?` when `.scaffold/build/` is empty, which means the build step inside the release didn't run: check that `release.bumpp.execute` is still set to `npm run build` in `zotero-plugin.config.ts`.

**The workflow failed partway through.** It publishes in a fixed order: create `v<version>`, upload the `.xpi`, then create or refresh the `release` release with the JSON assets. A failure in the second half leaves a `v<version>` release that looks finished but has no matching `update.json` behind it. Re-running the job as-is won't fix that, because creating a release for a tag that already has one is a hard error. Delete the `v<version>` release (the tag stays), then `gh run rerun <run-id> --failed`.

Don't be tempted to build locally and upload `update.json` by hand. It carries a sha512 of the `.xpi` it was built alongside, and your local `.xpi` is not byte-identical to the one CI built, so the hash won't match the asset users download.

**Users aren't getting the update.** Fetch the `update.json` asset from the `release` release and check the `update_link` in it resolves. A wrong `repository.url` in `package.json` produces working-looking URLs that point at a repository that doesn't exist, with no error anywhere in the build. [configuration-reference.md](./configuration-reference.md) lists the fields that fail this quietly.

**A release needs to be pulled.** Delete the `v<version>` GitHub release and its tag, then re-run the previous version's build and re-upload its `update.json` to the `release` release, or every installed copy keeps being offered the version you just pulled.
