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
