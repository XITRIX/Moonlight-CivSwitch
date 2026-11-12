# Runtime build dependencies

[sources.lock.json](sources.lock.json) pins Moonlight, ENet, nanors, Mbed TLS,
its framework submodule, and the Emscripten SDK. These dependencies are needed
to build the app's streaming runtime.

Bootstrap and build require Git, CMake, Python 3 and Node 22+. From the repository root:

```sh
npm run bootstrap
npm run build
```

Bootstrap clones `moonlight-common-c/` and `mbedtls/` here, including their
submodules, and installs/activates the SDK in `toolchains/emsdk/`. Checkouts
keep their own Git metadata and licenses and are ignored by the parent repo.
Existing checkouts at an unexpected revision are rejected rather than reset.
Bootstrap does not modify shell profiles or global SDK configuration.

Build tooling lives in [tools/wasm2js/](../tools/wasm2js/README.md), app runtime
glue in `app/native/`, intermediate files in `build/wasm2js/`, and generated
JavaScript in `dist/runtime/`. The distribution includes `manifest.json` with
source revisions, artifact hashes and compiler-transform counts, plus a
`licenses/` directory containing the upstream license texts.

Research references such as CivSwitch and nxhid remain under
[investigation/references/](../investigation/references/README.md).

## Moonlight-nx2 native video subset

`moonlight-nx2/` is a minimal, checksum-pinned selection from the supplied upstream
archive, not a checkout of the whole project. It contains only the 18 files needed
by `tools/build-native-runtime.py`: decoder/video JavaScript and ABI tables,
prebuilt video shaders, the license and provenance manifest. Keeping these inputs
allows offline, reproducible regeneration of `app/vendor/moonlight-nx2-runtime.js`.
The unused font atlas, font extraction tool and asset-blob builder were removed.

Shared display/context/refresh helpers already come from CivHomebrew-SDK and are
not copied here. Moonlight-specific decoder/protocol/presentation extensions stay
in this app. The console package contains the generated runtime and notices, not
this source directory. Do not vendor the upstream launcher or PC service here.

The Moonlight-NX2 subset also pins `session/bitrate.js` and `civ7/bitrate-adaptation.js` from the same supplied archive. The existing classic-module bundle exposes their Auto defaults and reconnect-based policy. See `docs/dynamic-bitrate.md` for integration, telemetry mapping and qualification limits.
