# Manual Moonlight releases

Push `.github/workflows/release.yml` to the repository's default branch, then
open **Actions → Release Moonlight → Run workflow**. Select the source branch and
enter a stable version such as `1.3.0` or `v1.3.0`. The job creates tag `v1.3.0`
at the exact selected commit and publishes the completed release as Latest.
Only manual dispatch triggers publishing. The built-in `GITHUB_TOKEN` needs
`contents: write`; no additional release secret or Switch connection is required.

The workflow bootstraps the pinned Emscripten 3.1.74 and upstream dependencies,
builds the runtime, and creates a fresh package using the input version. It sets
`extensions.updates` to the workflow repository's public GitHub latest-release
URL and selects `moonlight.civapp`, including when run from a fork. These are
read-only CI overrides: `payload.json` is not rewritten or committed.

The release contains:

- `moonlight.civapp`: the app package with matching version and update metadata.
- `package_payload.py`: the standalone Python packager.
- `SHA256SUMS`: checksums for both artifacts.

Host, generated-runtime, release-helper, package/inspection and Chrome checks
must pass. Workflow artifacts are retained before publication. The job uploads
every file to a draft release, verifies remote names/sizes/digests, then publishes
it as Latest, ready for CivHomebrew's **X Menu → Check app updates**. Public
repository visibility is required for console discovery without account tokens.

Versions must be newer than the latest stable release. Prerelease/build suffixes
and duplicate tags/releases are rejected; published files are never overwritten.
Release runs are serialized and detect a new latest release appearing during the
build. If uploading fails, a partial draft remains unpublished. Inspect/delete
that draft and its tag if one exists before retrying the same version.

Run `npm run test:release` for local helper tests with mocked GitHub operations.
The helper's `publish` command performs real publication and is not a local
verification command. For regular builds, continue to use `npm run build` and
`npm run package`; see [packager flags](../tools/README.md) for update metadata.
