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

## Provenance and checks

Adapted from [XITRIX/CivHomebrew](https://github.com/XITRIX/CivHomebrew), revision
`3acfcbbc26759f99c2b5de515fa071f88a4599d8`: the packaging CLI and format validation
are combined into one file, with `--inspect` added. It is a PC tool and is not
included in the app's runtime scripts.

Run `python3 -B tests/test_packager.py` for generic packaging checks, including a
copy of the single script running in an unrelated directory under isolated Python.
`npm run test:package` also launches Moonlight's package in Chrome to verify its
sources, script order, icon, runtime factory and UI lifetime. Build/package first;
set `CHROME_BIN` if needed. Browser checks do not establish console compatibility.
