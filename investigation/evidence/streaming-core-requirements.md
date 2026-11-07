# Reusing the Moonlight streaming core

Source investigation and device-evidence interpretation, 2026-11-07. Upstream requirements are distinguished from measured capabilities below.

Reviewed upstream revisions:

- `moonlight-common-c`: `e80a786afedeaccff63e839e68c8f3d8a057c13d` (2026-11-03).
- `XITRIX/Moonlight-Switch`: `a75fee223914f36ec26b29739d95331307960fa3`.

## What the core supplies

The reusable component is C, with a C callback API. It handles the streaming protocol, receive queues, packet recovery, control and input. The public API delivers Annex B compressed video decode units and Opus audio packets to client callbacks. A decoder, audio output and presentation surface remain client responsibilities. Direct-submit and pull-renderer capabilities alter callback/queue behavior; they do not remove every network or control thread. A successful compile or received packet therefore does not establish playback.

Sources: [public API and callback contract](https://github.com/moonlight-stream/moonlight-common-c/blob/e80a786afedeaccff63e839e68c8f3d8a057c13d/src/Limelight.h), [video receive path](https://github.com/moonlight-stream/moonlight-common-c/blob/e80a786afedeaccff63e839e68c8f3d8a057c13d/src/VideoStream.c).

## Platform dependencies

| Dependency | Upstream behavior | CivSwitch integration implication |
| --- | --- | --- |
| Threads and synchronization | Platform layer creates/join/detaches threads; mutexes, condition variables and events coordinate blocking queues. POSIX backend uses pthreads. | Stock core requires a real compatible threading backend or architectural adaptation. A no-op `pthread_create` substitute cannot run it. |
| Timers | Monotonic microsecond/millisecond time, interruptible sleeps and deadlines. | Map to the actual runtime's monotonic clock and scheduler; avoid blocking the UI thread. |
| Sockets | Raw TCP and UDP, bind/connect, send/receive, socket options, polling/timeouts and close/shutdown. | Existing HTTP/TLS proves a useful native bridge, but raw datagram behavior and stream-rate throughput must be tested separately. |
| Reliable control transport | Bundled modified ENet, with behavior/ABI changes required by the core. | Build the exact submodule, rather than substituting a system ENet. Adapt its socket operations as well as the core's. |
| Crypto | CMake selects OpenSSL crypto or MbedTLS crypto; platform crypto implements AES-CBC, AES-GCM and secure random generation. | Compile a suitable crypto dependency into Wasm/native code, or implement the narrow crypto backend. Native TLS alone does not supply this interface. |
| Client media | Compressed video and Opus callbacks. | Provide video decode/display and Opus decode/PCM playback with bounded buffers and teardown. |

Sources: [thread types/API](https://github.com/moonlight-stream/moonlight-common-c/blob/e80a786afedeaccff63e839e68c8f3d8a057c13d/src/PlatformThreads.h), [platform implementation](https://github.com/moonlight-stream/moonlight-common-c/blob/e80a786afedeaccff63e839e68c8f3d8a057c13d/src/Platform.c), [socket implementation](https://github.com/moonlight-stream/moonlight-common-c/blob/e80a786afedeaccff63e839e68c8f3d8a057c13d/src/PlatformSockets.c), [ENet requirement](https://github.com/moonlight-stream/moonlight-common-c/blob/e80a786afedeaccff63e839e68c8f3d8a057c13d/README.md), [build dependencies](https://github.com/moonlight-stream/moonlight-common-c/blob/e80a786afedeaccff63e839e68c8f3d8a057c13d/CMakeLists.txt), [crypto interface](https://github.com/moonlight-stream/moonlight-common-c/blob/e80a786afedeaccff63e839e68c8f3d8a057c13d/src/PlatformCrypto.h).

## Wasm routes

**Wasm plus workers and shared memory:** This is the closest Emscripten route to preserving the existing pthread architecture. Emscripten implements pthreads with workers and `SharedArrayBuffer`; shared Wasm memory and atomics must actually work. Standard browser deployments also require the documented isolation headers. A Gameface runtime must be measured directly rather than assumed to behave like Chrome. Native socket imports would need a thread-safe bridge, or carefully designed proxying to the owning thread. Existing exploit closures/native-call objects should not be presumed accessible from a worker.

**Wasm without workers/shared memory:** Useful C algorithms, Opus, crypto, parsing, packet recovery and codecs can still be reusable. The full core cannot retain its current threaded execution unchanged. A cooperative scheduler/event-loop port would need to replace blocking loops and queue waits. Asyncify can suspend/resume a C stack around asynchronous JS calls; that capability alone does not provide all the concurrently executing pthreads the core expects. This is a possible engineering route, not a tested drop-in build.

Sources: [Emscripten pthread requirements and main-thread blocking restrictions](https://emscripten.org/docs/porting/pthreads.html), [Asyncify and JSPI semantics](https://emscripten.org/docs/porting/asyncify.html).

**Networking is independent of Wasm support.** Emscripten's ordinary browser socket facilities use web transports/proxies; they do not grant direct GameStream UDP. A companion proxy conflicts with this experiment's all-on-Switch preference. Imports that reach CivSwitch's native TCP/UDP functions are therefore the relevant route. A Wasm function/table index is not an ARM64 function pointer that can simply become a native thread entry point.

Source: [Emscripten networking options and limitations](https://emscripten.org/docs/porting/networking.html). The thread-entry distinction follows the separation between a Wasm instance and native machine-code ABI; a native/Wasm runtime embedding bridge would require its own implementation and validation.

cpp.js/crossbind supplies compilation and bindings; it does not satisfy the missing platform services. Since common-c already exposes a C interface, a small explicit export/import adapter is sufficient for an initial test. Source: [cpp.js supported targets and bindings](https://cpp.js.org/).

### Measured runtime limits

The actual cartridge runtime reports no `WebAssembly`, `Worker`, WebCodecs, WebAudio, Media Source Extensions or WebGPU; both WebGL context requests return unavailable. `SharedArrayBuffer` and simple atomics do work, but do not supply the missing worker or Wasm runtime. Consequently cpp.js/crossbind's ordinary browser Wasm route is currently unavailable in this environment. This is a measurement of the exposed runtime, not proof that no alternate native or interpreted implementation could be added. Evidence: [streaming-web.txt](streaming-web.txt).

Local H.264 MP4 and VP8 WebM fixture playback through tested data/blob URLs failed with media error 4. VP8/VP9 `canPlayType` responses therefore did not establish working playback. The result is bounded to the tested fixture/URL paths; it does not exclude every game-native movie path. Evidence: [streaming-media.txt](streaming-media.txt).

Native UDP loopback exchanged a verified 1,200-byte datagram. Corrected external typed-array pointers support verified 1 MiB native copies. Existing native Opus decoded three fixture packets, and an existing SDK thread entry completed create/start/wait/destroy at SDK priority 0. These observations establish useful components, rather than a full-rate streaming pipeline. The copy timings round to 0 ms, so they are not a trustworthy throughput benchmark. Evidence: [streaming-native.txt](streaming-native.txt), [streaming-native-execution.txt](streaming-native-execution.txt), [streaming-thread.txt](streaming-thread.txt).

An own-heap-page RX request returned `0xd801`. That request used `svcSetMemoryPermission`, whose documented contract excludes executable permissions. It therefore does **not** demonstrate that the process cannot load native code. libnx's actual JIT paths use CodeMemory or privileged process-code mapping and permission APIs, with separate permission/environment requirements. Its same-process CodeMemory route requires a kernel patch on stock systems from 5.0 onward. Do not infer availability here from exported wrapper names. Evidence: [streaming-code.txt](streaming-code.txt); primary references: [SVC permission contract](https://github.com/switchbrew/libnx/blob/master/nx/include/switch/kernel/svc.h), [libnx JIT implementation and capability checks](https://github.com/switchbrew/libnx/blob/master/nx/source/kernel/jit.c).

The corrected audio probe opened a native AudioOut at 48 kHz, stereo, Int16; appended a short PCM buffer; measured 4,800 played frames; retrieved the same released buffer; and closed the output. This establishes native PCM consumption and buffer release. The log does not independently establish what the user heard or sustained streaming latency. Earlier, an unconfirmed synchronous `nvdrv` lookup blocked before the output test; that request was removed. A JavaScript timeout cannot interrupt a native call already blocking its thread. Evidence: [streaming-audio.txt](streaming-audio.txt).

### Why hidden Wasm exports do not yet provide usable Wasm

Read-only native inspection identifies V8 **9.4.146.24**, `FLAG_jitless=1`, `FLAG_expose_wasm=0`, and exported Wasm installation/compilation functions. `FLAG_wasm_lazy_compilation=0` and `FLAG_allow_natives_syntax=0` were also read. This refines the earlier result: Wasm implementation code is present in the binary, while the running JS environment does not expose the API. No flags or runtime state were changed. Evidence: [streaming-wasm-internals.txt](streaming-wasm-internals.txt).

Matching upstream V8 9.4.146.24 deliberately disables Wasm exposure during process initialization under `jitless`. Its comment explains that the Wasm implementation still requires runtime executable memory. Source: [V8 initialization policy](https://github.com/v8/v8/blob/9.4.146.24/src/init/v8.cc#L127).

More decisively, both synchronous native-module compilation and the asynchronous compilation-job constructor contain `CHECK(!FLAG_jitless)`. In upstream V8 these are fatal checks, rather than catchable JavaScript compile errors. Changing only `expose_wasm`, or calling `WasmJs::Install`, would not make compilation a valid operation. The exact shipped platform may contain patches, so matching source is a reason to avoid that unsafe test, rather than a claim that we executed and observed its failure. Source: [V8 module compilation checks](https://github.com/v8/v8/blob/9.4.146.24/src/wasm/module-compiler.cc#L1602).

`WasmJs::Install` constructs the JS API and stores context objects. It does not create an executable-memory platform or reconfigure the isolate. The isolate separately captures the original jitless flag at construction, and Wasm code allocation requests a jittable virtual-memory region. Consequently changing the global flag later is not an established transition from a live jitless isolate to a working compiled-Wasm environment. Sources: [API installation](https://github.com/v8/v8/blob/9.4.146.24/src/wasm/wasm-js.cc#L2472), [captured isolate policy](https://github.com/v8/v8/blob/9.4.146.24/src/execution/isolate.cc#L3011), [Wasm executable-memory allocation](https://github.com/v8/v8/blob/9.4.146.24/src/wasm/wasm-code-manager.cc#L1958).

There is no production `--wasm-interpret-all` escape hatch in this version: V8 removed that flag in 2020 when moving the old interpreter to tests, explicitly noting that no non-compiling tier remained. New V8 documentation describing the DrumBrake interpreter refers to a much later engine and is not evidence that this V8 9.4 binary can enable it. Sources: [upstream removal commit](https://chromium.googlesource.com/v8/v8.git/+/6f4991fada3a038faaa16c509538fbb0f928d64c), [current architecture for comparison](https://chromium.googlesource.com/v8/v8/+/main/docs/wasm/architecture.md).

Conclusion: enabling Wasm here requires establishing a supported native execution/memory route and correct engine initialization, or supplying a separate interpreter/runtime. A flag change is insufficient. Workers and the native socket/media adapter would still be separate requirements for the unchanged streaming core.

### Native H.264 decoding: verified fixture

After inspection of the constructor, backend initialization, queue methods and admission path, an actual `movie::Decoder` instance was constructed with type 1, output format 4, mode 1 and priority 16. It reported a valid implementation and no last error; destruction completed. These are measured parameters for this installed module, rather than a portable enum declaration. Evidence: [decoder construction and teardown](streaming-movie-instance.txt); supporting static evidence: [constructor/method disassembly](streaming-movie-abi.asm.txt), [queue disassembly](streaming-movie-queue-abi.asm.txt), [backend disassembly](streaming-movie-backend.asm.txt).

The native decoder then configured and started successfully, accepted a **680-byte Annex B H.264 fixture**, and returned a CPU-readable 64×64 NV12 picture. Output metadata reported Y stride 64/offset 0 and UV stride 64/offset 4,096. The complete 6,144-byte buffer contained exactly 4,096 Y bytes at 41, 1,024 U bytes at 240 and 1,024 V bytes at 110, matching the blue fixture. Output flags were 0; the buffer was released and the decoder stopped successfully. This establishes real H.264 decoding, rather than constructor existence, MIME support or an empty output buffer. Evidence: [successful frame decode and exact pixel checks](streaming-h264-frame.txt).

The earlier two-byte AVCC submission returned no picture before draining; after EOS it produced a black output with flags 4, rather than the expected blue image. Those results are preserved as failed framing experiments and are not counted as successful decode. The configuration helper's AVCC-shaped parameter record therefore did not establish that this decoder wanted AVCC-framed picture input. Evidence: [AVCC without drain](streaming-h264-frame-without-drain.txt), [AVCC/EOS output](streaming-h264-frame-avcc-drain.txt).

The successful test submitted a drain request after its single fixture. Continuous input without EOS, decoding of interdependent frames, larger resolutions, sustained throughput, presentation and latency remain untested. The logs also do not establish whether this native implementation used a hardware decoder or software; no hardware-class claim follows from the exported names or the fixture result.

## Existing Switch client's media path

Later native probes also returned all 30 frames from a paced 720p30 sequence.
The solid-blue sequence matched sampled NV12 values and kept the JS timer
running. A moving fixture returned all 30 expected timestamps and exact sampled
luma, but chroma differed from FFmpeg by up to 10 in U and 36 in V; the color
reference test failed. A tiny decoded frame was encoded as PNG and loaded by a
temporary UI image. These results improve confidence in native decode, while
leaving chroma fidelity, continuous presentation and full-session performance
unresolved. See [the current measured ledger](streaming-feasibility.md).

The current homebrew Switch client is a useful implementation reference, rather than evidence that Civ VII exposes the same services:

- Its FFmpeg platform helper selects `AV_HWDEVICE_TYPE_NVTEGRA`, requires hardware decoding for the deko3d path, and sets `AV_PIX_FMT_NVTEGRA`. [Decoder helper](https://github.com/XITRIX/Moonlight-Switch/blob/a75fee223914f36ec26b29739d95331307960fa3/app/src/streaming/ffmpeg/FFmpegVideoDecoderDekoHelpers.cpp).
- Its renderer extracts the NVTEGRA frame buffer mapping/handle and builds GPU images for luma/chroma; this is a native resource integration, not ordinary HTML video. [deko3d renderer](https://github.com/XITRIX/Moonlight-Switch/blob/a75fee223914f36ec26b29739d95331307960fa3/app/src/streaming/video/deko3d/DKVideoRenderer.cpp).
- Its audio implementation decodes with `opus_multistream_decode`, allocates an aligned PCM pool, and queues audio-renderer wave buffers through libnx `audren`/`audrv`. [Audren renderer](https://github.com/XITRIX/Moonlight-Switch/blob/a75fee223914f36ec26b29739d95331307960fa3/app/src/streaming/audio/AudrenAudioRenderer.cpp).

CivSwitch runs inside an existing retail game's process. Service access, decoder APIs, GPU interoperability and audio mixing must be established there. Homebrew libnx/deko3d code is not automatically ABI-compatible with the retail SDK. A native ARM64 core also needs executable-code loading, relocation/import resolution and safe thread startup, beyond the demonstrated ability to call existing functions.

## Capability checklist and remaining work

Subsequent update: the [wasm2js build](wasm2js.md) now executes actual upstream
RTSP, FEC and crypto algorithms on this Switch as ordinary JavaScript, with all
54 public Li APIs exported. This bypasses the disabled Wasm engine; scheduling,
native socket/media adapters and a complete streaming session remain unfinished.

| Question | Current evidence | Remaining work |
| --- | --- | --- |
| Does the exposed runtime run Wasm? | **Unavailable:** `WebAssembly` absent; native inspection establishes jitless V8 with Wasm hidden. | A separate supported runtime or correct native engine initialization/executable-memory path would be needed. Flag-only installation has not been attempted and is not established as valid. |
| Can stock Emscripten pthreads run? | **Unavailable through normal web APIs:** Worker absent; shared buffers and simple atomics work. | Supply a different execution model or establish a compatible worker/runtime bridge. |
| Can native sockets exchange UDP? | **Passed for loopback:** verified 1,200-byte datagram. | Demonstrate LAN stream traffic, packet-rate capacity, sustained buffer transfer and cancellation under load. |
| Can native code decode H.264? | **Passed for fixtures:** exact 64×64 blue frame and 30 returned 720p pictures. Moving fixture timestamps/luma match, with chroma differences. | Resolve chroma differences, measure sustained realistic workloads and latency. |
| Can the decoded picture be displayed? | **Limited proof:** a PNG derived from decoded pixels loaded in a temporary UI image. | Establish an efficient continuous texture/native-surface path and verify the resulting image on screen. |
| Can audio decode and output work? | **Passed independently:** native Opus decoded three fixtures; native AudioOut consumed/released 4,800 stereo PCM frames. | Join Opus to continuous PCM output; verify audible playback, queue behavior, latency, synchronization and repeated teardown. |
| Can our compiled streaming core execute? | **Passed as wasm2js for algorithm diagnostics:** complete core compiled with 54 Li API exports; actual RTSP/FEC/crypto tests pass on Switch. New native library loading remains unestablished. | Adapt scheduler and native sockets/media before the generated core can run a streaming session. Heap RX denial through syscall 2 does not settle native loading. |
| Does a full Moonlight session work? | **Untested:** pairing, listing and cover art are separate working app features. | Integrate streaming control/RTSP/ENet, packet processing, remote input, callbacks, presentation, audio and clean cancellation. |

The device now has verified native H.264 decode, Opus decode, PCM output and UDP building blocks. This makes a client implementation materially more plausible, while efficient presentation, continuous performance and the execution route for the reusable C core remain necessary feasibility gates. A playable Moonlight stream has not yet been demonstrated.
