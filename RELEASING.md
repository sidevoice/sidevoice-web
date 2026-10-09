# Releasing

One version for the whole web, tagged `vX.Y.Z`. It lives in the root `package.json`, the two workspaces'
`package.json` (`apps/web`, `packages/protocol`), the web's pin of
`@sidevoice/protocol`, and `package-lock.json`; release-please moves them together (`release-please-config.json`).
Never edit them by hand.

## What each act means

| Act | Who | What happens |
|---|---|---|
| Open / update a PR | anyone | `CI`: the build and the tests (Linux), and the static site assembled. **PR title is a conventional commit**. Nothing is packaged. |
| Squash-merge into `main` | reviewer | The PR title becomes the commit. `CI` runs the same and packages the static site; when it is green, the `nightly` pre-release is replaced. release-please opens or updates the **release PR** ("chore(main): release X.Y.Z"). Nothing versioned is published. |
| Merge the release PR | a maintainer | **This is the release.** release-please tags `vX.Y.Z` and creates a draft GitHub Release whose notes are that version's changelog; `CI` runs from the tag, attaches the assets and publishes the Release. |

Assets of a release:

- `sidevoice-web-X.Y.Z.tar.gz`: the static site, in the layout `scripts/assemble-static-web.mjs` makes, at the root
  of the archive: `index.html` (redirects to `/voice/`), `voice/` (the page, with an empty `target.js` for whoever
  serves it to fill). The same layout the desktop app vendors
  and `deploy/web-static/` serves.
- `SHA256SUMS`.

The changelog is written from the squashed PR titles. To change it, edit `CHANGELOG.md` in the release PR right
before merging it: any later merge into `main` regenerates the PR. After the release, fix the notes on the
Release itself.

## Which version comes next

`fix:` → patch, `feat:` → minor. While the version is 0.x a breaking change (`feat!:` or a `BREAKING CHANGE:`
footer) bumps the minor, not the major. `docs:`, `chore:`, `ci:`, `test:`, `refactor:` alone make no release.

Nothing is tagged by release-please yet: the manifest starts at 0.1.0 (the version the packages carry), and
release-please reads the history from the commit where this repository became the web alone (`bootstrap-sha`).
The first release PR proposes 0.2.0 if there is a `feat`. To publish another version, use `Release-As` (below).

The `v0.4.3`, `v0.5.0` and `v0.6.0` tags in this repository come from the history before the web had a
repository of its own; they are not releases of the web. A web version that reaches one of them would collide with it.

## A release candidate, or any explicit version

Put the footer as the **last line of a PR's description** (the squash commit takes the description as its body):

```
Release-As: 0.3.0-rc.1
```

The release PR then proposes exactly that version. A version with a `-` suffix is published as a **pre-release
and never as latest**. The next candidate is `Release-As: 0.3.0-rc.2`; the final one is `Release-As: 0.3.0`
(say it: after a candidate, do not leave the next version to the computation). With nothing else to merge, a PR
with one empty commit (`git commit --allow-empty`) carries the footer.

## Nightly

Every green `CI` on `main` moves the tag `nightly` to that commit and replaces every asset of the one `nightly`
pre-release: `sidevoice-web-X.Y.Z-nightly.tar.gz` (X.Y.Z is the last release's version, which the packages still
carry) and `SHA256SUMS`. Its notes give the commit and its date. It is a snapshot, not a version: it is never
latest, and release-please ignores the tag (it is not `vX.Y.Z`). Pin a `vX.Y.Z` release, never `nightly`.

Build artifacts on Actions runs are kept 7 days, for debugging only. Download from Releases.

## When something fails

- The build of a release fails: the Release stays a draft, its tag in place. Fix forward if needed, then re-run
  the failed jobs of that `release-please` run (Actions). Nothing is published until every job passed.
- A `nightly` run fails: the previous snapshot stays. The next green push replaces it.

## What this needs from the repository settings

- Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests**: without it
  release-please cannot open its PR.
- Squash merging, with the PR title as the commit message.
- Required check **PR title is a conventional commit**. release-please's own PR gets it through a dispatched run
  (its pushes start no workflow by themselves).
