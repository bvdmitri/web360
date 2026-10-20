# Releasing

One tag publishes a version to npm and to GitHub together, so the two never drift apart.

1. In `packages/web360/package.json`, set the new version.
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, open a fresh empty
   `## [Unreleased]` above it, and add the version's link (its GitHub Release) at the bottom.
3. Commit, then tag and push: `git tag -a vx.y.z -m "web360 x.y.z"` and
   `git push origin main vx.y.z`.

The release workflow (`.github/workflows/release.yml`) then checks that the tag matches the
package's version and that the changelog has its section, runs every check and test, publishes
the package to npm with provenance (npm trusted publishing, no token), and creates the GitHub
Release from the changelog section. It is safe to re-run: a version already on npm is not
published again, and an existing Release is left as it is.

A tag is not a release until both the npm version and the GitHub Release exist.
