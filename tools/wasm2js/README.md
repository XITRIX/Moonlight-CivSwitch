# moonlight-common-c as executable JavaScript

The entire upstream core is compiled through Emscripten/wasm2js into
`dist/runtime/moonlight-core.js`. This includes ENet, nanors FEC, and real Mbed TLS/PSA
cryptography. All 54 public `Li*` functions are exported. Upstream sources are
unmodified; runtime integration lives in `app/native/`, and regression checks
live in `tests/runtime/`. All paths below are relative to the repository root.

**Verified on the actual Switch:** the generated library initialized and passed
RTSP, FEC, AES-GCM/replay/tamper and secure-entropy checks with no WebAssembly or
Worker API. This validates the baseline build. The separate streaming target described below
now completes real Sunshine sessions on the Switch.
The stock non-pthread build returns EAGAIN (6) when a thread is requested.

## Files and reproducibility

- `third_party/sources.lock.json`: pinned core, submodules, crypto dependency and SDK revisions.
- `tools/wasm2js/bootstrap.py`: clones missing sources and installs/activates a local SDK.
- `tools/wasm2js/build.py` / `tools/wasm2js/CMakeLists.txt`: compile all core sources and export the public API.
- `app/native/bridge.c`: secure-entropy import and diagnostics using the actual C algorithms.
- `tools/wasm2js/crypto-config.h`: crypto uses volatile keys and supplied secure entropy; no file storage.
- `tests/runtime/test-core.cjs`: browser-like VM with WebAssembly/Workers absent and Wasm execution disabled.
- `investigation/probes/send-console-test.py` / `investigation/probes/probe-console.js`: bounded in-memory upload and on-console tests.
- `dist/runtime/`: generated JS, manifest and third-party licenses; ignored by Git.
- `build/wasm2js/`: generated objects/cache; ignored by Git.

From the repository root:

```sh
python3 -B tools/wasm2js/bootstrap.py
python3 -B tools/wasm2js/build.py
node tests/runtime/test-core.cjs
```

The SDK is pinned to Emscripten 3.1.74, which includes wasm2js support. Newer
Emscripten documentation deprecates `WASM=0`; use the pinned version instead of
relying on future defaults. The build uses `-sWASM=0 -sSINGLE_FILE=1`, so the
result has no external `.wasm` or `.data` file and requires no Wasm runtime.
See [Emscripten's WASM setting](https://emscripten.org/docs/tools_reference/settings_reference.html#wasm).

Dependency sources stay under `third_party/`; the SDK stays under `toolchains/emsdk/`.
Bootstrap does not change shell profiles or global SDK configuration. Existing
checkouts at a different revision are rejected instead of reset. Toolchain and
cloned repositories are ignored; their licenses and provenance are retained.

## Loading the module

The artifact defines an asynchronous `MoonlightCore` factory. Example for Node:

```js
const MoonlightCore = require('./dist/runtime/moonlight-core.js');
const { randomFillSync } = require('node:crypto');
const core = await MoonlightCore({
  moonlightPlatform: { randomFill: randomFillSync }
});
console.log(core._ml_test_rtsp()); // 0
```

For CivSwitch, supply `randomFill(view)` using the existing native secure RNG;
`investigation/probes/probe-console.js` demonstrates this adapter. The provider must synchronously
fill the borrowed byte view. There is no Math.random fallback. `_malloc`/`_free`,
typed heap views, `ccall`/`cwrap`, UTF-8 helpers and function-table helpers are
available. **C pointers are offsets into this module's JS heap, not native Switch
addresses.** Native adapters must validate/translate/copy buffers and structures.

## Hardware test

Close the app UI and leave CivSwitch waiting on port 9026, then run:

```sh
python3 -B investigation/probes/send-console-test.py 192.168.1.182
```

The 740,701-byte tested artifact exceeds the loader's 500 KiB payload limit.
The sender uploads it in five bounded chunks, assembles/evaluates it in memory,
and cleans up the temporary upload/helper globals on completion. No Switch
filesystem is mounted or written. Emscripten's default MEMFS exists only inside
the module's JS heap; NODEFS/NODERAWFS are not enabled or mounted. The library
currently retains Emscripten's POSIX socket implementation, which depends on
MEMFS and WebSockets. **That implementation is not a native UDP adapter.**

If a payload fails or stops returning logs, inspect the evidence before retrying.
The hardware probe does not start or launch a Sunshine session.

## Streaming target

`dist/runtime/moonlight-stream.js` compiles the pinned upstream protocol,
ENet, FEC and crypto sources, replacing `Platform.c` with the cooperative
platform implementation under `app/native/`. Linker wrappers replace POSIX
sockets with native Switch TCP/UDP and nonblocking readiness polling.
Emscripten Asyncify fibers preserve C stacks without Wasm, Workers, pthreads,
or injected ARM64 code. C stacks must be 16-byte aligned; 8-byte alignment
caused incorrect optimized stack accesses and is covered by hardware evidence.

The checkout stays unchanged. Hash-checked build copies adapt `RtpVideoQueue.c`
to avoid redundant duplicate scans after a sequence gap and `VideoStream.c`
to receive unencrypted video directly into 32 C-owned packet buffers. The latter
checks buffer alignment before telling the compiler that headers are aligned.
Encrypted/unsupported paths preserve the original socket receive. Two guarded
wasm2js postpasses specialize exact RTP timestamp arithmetic and the remaining
378 unaligned i32 load sites; changed compiler shapes fail the build.

The streaming target uses `-O3 -flto` at compile and link time. The diagnostic
core target retains its baseline options. `tests/runtime/test-runtime.cjs` exercises RTSP,
FEC, cryptography and unaligned accesses on the actual streaming artifact as
well as scheduler, input wake, cancellation and PNG bounds checks. See the
[40 Mbps investigation](../../investigation/evidence/quality-40mbps.md) for measured live results.

`app/src/streaming/` supplies native socket/memory, movie H.264 decoder,
Opus/AudioOut, Sunshine launch negotiation and lifecycle adapters. The core
keeps the upstream RTSP, ENet, FEC, decryption and packet assembly logic.
Remote input is queued on the JS side and dispatched from a cooperative C task.

```sh
node tests/runtime/test-runtime.cjs
node tests/runtime/test-direct-receive.cjs
python3 -B tests/runtime/test-wasm2js-specialization.py
python3 -B tools/send_ui.py 192.168.1.182
```

The runtime test checks scheduling and NV12→PNG pixel values, CRCs and bounds.
`investigation/probes/send-runtime-test.py` uploads the streaming target and runs bounded probes;
its default probe checks C scheduling plus real native HTTP and UDP. The
`investigation/probes/probe-live-stream.js` experiment additionally launches Desktop and streams for
20 seconds; extra app sources must be passed with `--extra` (see the commands in
[streaming notes](../../docs/streaming.md)). Probes use RAM only on the Switch.

The full path has decoded real host frames and presented them in Gameface.
The initial PNG renderer is deliberately low resolution and rate limited;
this does not establish acceptable game-streaming latency or smoothness.

Hardware and local results: [baseline wasm2js evidence](../../investigation/evidence/wasm2js.md)
and [live streaming evidence](../../investigation/evidence/streaming-live.md).

The streaming target additionally wraps nanors implementation selection with
`app/native/fec-cooperative.c` and synchronous GF byte kernels in
`app/native/platform-library.js`. It retains upstream's field, algorithm and ABI. Recovery
checks the scheduler deadline between small groups of vector operations.
`tests/runtime/native/fec-tests.c` holds diagnostic exports for parity equivalence, large erasure
recovery, suspension and kernel timing. See the
[80 Mbps investigation](../../investigation/evidence/quality-80mbps.md).

The [follow-up](../../investigation/evidence/quality-80mbps-followup.md) adds word/paired GF lookup
kernels, packet-buffer reuse, and direct owned receive. These larger allocations
and the H.264 reference-recovery capability are enabled at 40–80 Mbps after the
[Wreckfest stall investigation](../../investigation/evidence/wreckfest-stalls.md) exposed IDR
recovery stalls at 50 Mbps. The larger 13.5 ms pump budget remains 80 Mbps only. Tables
are prepared before launch with cancellation points. Full upstream recovery
remains enabled; experimental FEC cutoffs are archived outside the app.
