# Standalone .civapp packager

Copy **`package_payload.py`** into any repository. It is a single-file tool using
only the **Python 3.10+ standard library**: no project imports, pip packages,
Node.js, CivHomebrew checkout or network access. It builds CivHomebrew `.civapp`
format version 1 and can validate existing packages.

## Package Moonlight

After `npm run build`, run `npm run package` from the repository root. This creates
and inspects `dist/moonlight.civapp`. The equivalent commands are:

```sh
python3 tools/package_payload.py --directory . --non-interactive -o dist/moonlight.civapp
python3 tools/package_payload.py --inspect dist/moonlight.civapp
```

## Reuse in another repository

Add the script and a `payload.json` at your project's root:

```json
{
  "id": "my-app",
  "name": "My App",
  "author": "Your name",
  "release": "1.0.0",
  "description": "A CivSwitch application.",
  "api": 1,
  "scripts": ["lib.js", "app.js"],
  "icon": null
}
```

Paths are relative to the manifest directory. Put dependencies first and the
entry script last. Use `null` for no icon, or a path to a 256×256 PNG. The tool
preserves order and validates paths, sources, metadata, artwork and size limits.
It does not build dependencies or discover scripts; generate all required files
before packaging.

Run without arguments for interactive setup, or use explicit flags in CI.

## CI usage

With a complete manifest, use this in any CI shell step:

```sh
python3 tools/package_payload.py --directory . --non-interactive \
  --no-save-metadata -o artifacts/my-app.civapp
python3 tools/package_payload.py --inspect artifacts/my-app.civapp
```

Upload `artifacts/my-app.civapp` using your CI provider's artifact step. The tool
requires no access to a Switch. Both commands exit nonzero on invalid input;
`--non-interactive` never prompts, and `--no-save-metadata` keeps sources unchanged.
Identical inputs produce identical package bytes; output is written atomically.

A manifest is optional when all settings are supplied explicitly:

```sh
python3 tools/package_payload.py --directory . --non-interactive \
  --no-save-metadata --id my-app --name "My App" --creator "Your name" \
  --version 1.0.0 --script lib.js --script app.js --no-icon \
  -o artifacts/my-app.civapp
```

Arguments override saved metadata. `--version RELEASE` changes the app release,
not the package format version. See `--help` for all options.

## App updates

Configure updates with flags or the interactive prompts:

```sh
python3 tools/package_payload.py --directory . --non-interactive \
  --releases-url https://github.com/OWNER/REPO/releases/latest \
  --update-asset my-app.civapp -o dist/my-app.civapp
```

The tool saves `extensions.updates` with `schema: 1`, `releasesUrl`, and the
optional `asset`. Moonlight already declares its own repository and
`moonlight.civapp`. URL and filename validation runs before writing any output.
Omit the asset to discover exactly one `.civapp` in the release, or pass
`--update-asset ""` to clear a saved name. `--no-updates` disables updates while
preserving other extensions. An interactive blank URL saves `updates: null`,
remembering the disabled choice. Complete saved settings are reused without
prompts; `--no-save-metadata` makes all overrides temporary.

App updates require public GitHub releases and matching SemVer release tags/app
versions. The [manual release workflow](../docs/releases.md) builds and publishes
the correct package version and declaration automatically.

## Provenance and checks

Adapted from [XITRIX/CivHomebrew](https://github.com/XITRIX/CivHomebrew), revision
`3acfcbbc26759f99c2b5de515fa071f88a4599d8`: the packaging CLI and format validation
are combined into one file, with `--inspect` added. It is a PC tool and is not
included in the app's runtime scripts.

Generic packaging checks live in CivHomebrew-SDK (`npm test`), including a copy
of the single script running in an unrelated directory under isolated Python.
The packager is vendored from the checksum-pinned SDK release.
`npm run test:package` also launches Moonlight's package in Chrome to verify its
sources, script order, icon, runtime factory and UI lifetime. Build/package first;
set `CHROME_BIN` if needed. Browser checks do not establish console compatibility.


Local investigation/tool regressions run with `npm run test:tools`. Optional
console qualification helpers require an explicit address; they are not part of
host tests. For the SDK roundtrip, use
`python3 tools/test_sdk_device.py arm moonlight --host SWITCH_IP --sunshine PC_IP`
only after installing matching packages and returning to Launcher. The Sunshine
address must already be reachable and paired. Device actions remain explicit CLI
operations; no console action runs as part of packaging or test commands.


The SDK deployment helper uses CivHomebrew's `tools/install_streamed.py` for
packages larger than 8 MiB. It sends and verifies one extracted file at a time,
then publishes the installed manifest/catalog. Do not resend a large monolithic
RPC after a console reset. The first 27 MiB Doom RPC crashed Civ VII; the exact
native cause was not established. Completed installs are detected by their
manifest checksum and still read back before a deployment receipt is accepted.
