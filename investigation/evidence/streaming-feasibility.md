# Streaming feasibility — Switch 2 / CivSwitch

Measured on the user's console on 2026-11-07. This is an investigation, not an
implemented streaming client. The application and saved pairing were not changed.
No Switch filesystem operations were performed by these streaming probes.

## Decision

Native H.264 decoding, Opus decoding, PCM playback, UDP and native threads all
work through this process's existing functions. This makes an all-on-Switch
streaming client substantially more plausible. It does not yet prove that the
unchanged Moonlight core can execute here or that decoded video can be presented
efficiently at streaming frame rates.

The stock browser Wasm route used by cpp.js/crossbind is unavailable. The actual
V8 engine is 9.4.146.24 with `jitless=1` and `expose_wasm=0`. Merely finding Wasm
code in the executable or changing an exposure flag does not supply a working
Wasm execution platform. See the matching-source analysis in
[streaming-core-requirements.md](streaming-core-requirements.md).

## Findings ledger

| Question | Observation | Boundary / next requirement | Evidence |
| --- | --- | --- | --- |
| WebAssembly | API absent from window/globalThis/bare evaluation. Native engine version and disabled flags read. | Arithmetic/memory/import/SIMD tests cannot execute through an absent API. No flags were changed; no usable Wasm instance was created. | [Web inventory](streaming-web.txt), [global checks](streaming-globals.txt), [engine flags](streaming-wasm-internals.txt) |
| Workers | Worker and SharedWorker absent. SharedArrayBuffer and basic atomics work. | Shared memory alone does not provide Emscripten pthreads. | [Web inventory](streaming-web.txt) |
| Web video/audio/GPU | No WebCodecs, WebAudio, MSE, WebGPU or WebGL context. Tested H.264/VP8 data/blob video URLs failed with media error 4. | Bounded to those web APIs and source paths; native media is a separate path. | [Web inventory](streaming-web.txt), [media attempts](streaming-media.txt) |
| UDP | Verified one 1,200-byte datagram between native nonblocking loopback sockets. | LAN packet loss, sustained bitrate, socket polling and concurrent audio/video were not benchmarked. Existing app separately proves LAN TCP/TLS. | [Native networking](streaming-native.txt) |
| Bulk buffers | Verified exact 1 MiB JS → native → JS copies through memcpy after validating backing addresses. | 0 ms measurements reflect clock resolution, not an accurate bandwidth result. | [Native execution](streaming-native-execution.txt) |
| Threads | Existing native thread entry created, started, joined and destroyed. | Proves existing code can run on an SDK thread, not that JS/Wasm callbacks or newly compiled code can run there. | [Corrected thread test](streaming-thread.txt) |
| Opus | Three real 20 ms, stereo 48 kHz packets decoded into 960 samples/channel each, with nonzero PCM. | Separate decoder test; multichannel and sustained synchronized audio remain open. | [Opus and copies](streaming-native-execution.txt) |
| PCM playback | Native AudioOut accepted stereo Int16 at 48 kHz, consumed 4,800 frames and returned the same buffer; stopped and closed. | No independent audible confirmation or sustained latency measurement. | [Audio output](streaming-audio.txt) |
| H.264 configuration | SPS parsed as 64×64 at 5 fps; native decoder constructed, configured and started. | Initialization alone is insufficient; pixel checks below establish actual decoding. | [Configuration](streaming-movie-config.txt), [instance lifecycle](streaming-movie-instance.txt) |
| H.264 pixels | Annex B sample returned a 6,144-byte 64×64 NV12 picture, flags 0, exactly Y=41, U=240, V=110, matching local FFmpeg output. | One baseline fixture; no claim about every codec/profile or hardware versus software backend. | [Frame](streaming-h264-frame.txt) |
| Short 720p sequence | All 30 frames submitted at 30 fps returned with correct sampled blue pixels; EOS received; decoder error 0. First frame 67 ms, last 991 ms, elapsed 1,023 ms. | One-second solid-color, low-bitrate baseline stream into CPU output. These are wall-clock probe timings, not network-to-display latency or a demanding motion/bitrate benchmark. | [Sequence](streaming-h264-sequence.txt) |
| Moving 720p sequence | All 30 pictures returned with correct timestamps. All sampled luma values matched FFmpeg exactly in all 30 pictures. Chroma samples differed by up to 10 in U and 36 in V. | Full color-reference check failed at the ±2 threshold. Cause of chroma differences remains unresolved; do not call the output pixel-identical or image quality verified. Diagnostic sampling/logging also adds JS overhead: final run took 1,131 ms with a maximum timer gap of 69 ms. | [Motion run](streaming-h264-motion-sequence.txt), [sample pairs](streaming-h264-motion-pixels.txt), [channel analysis](streaming-h264-motion-channels.txt) |
| UI responsiveness | During the sequence a 16 ms JS timer ran 60 times; largest observed gap 29 ms. | Shows event-loop progress, not a render FPS measurement or a comprehensive input test. | [Sequence](streaming-h264-sequence.txt) |
| Presentation | NV12 from the decoded 64×64 picture was converted to RGB, encoded as PNG in JS and loaded by a temporary visible img element; onload fired. | No independent screenshot/human confirmation. This establishes an image-upload path, not an efficient continuous renderer. | [PNG preview](streaming-h264-preview.txt) |
| Own native machine code | Ordinary heap RX request returned `0xd801`. Native ro/jit exports are present. | The tested SVC disallows execute by contract, so this is not proof that all code-loading routes fail. CodeMemory/NRR/JIT service integration and executable loading remain unestablished. | [Permission probe](streaming-code.txt), [source analysis](streaming-core-requirements.md) |

Native decoding uses the loaded multimedia module's `movie::Decoder`, type 1,
output format 4, mode 1, with its own default thread priority. Output metadata
reports NV12 strides and offsets. Buffers are aligned to the reported 4,096-byte
alignment. Every successful media probe releases output indices, stops the
decoder and destroys its owned native objects.

## Failed attempts and corrected interpretations

- The initial bulk-copy probe crashed because the loader's generic backing-store
  helper read an unrelated upper word as part of a normal typed-array base
  pointer. The corrected probe reads the actual 32-bit base field and validates
  known bytes before using memcpy. [Initial log](streaming-native-first-attempt.txt).
- An initial native thread test used SDK priority 44. Disassembly showed an
  internal +28 translation, making that value invalid. SDK priority 0 completed
  successfully in the corrected standalone test.
- A synchronous request for literal `nvdrv` blocked and required a game restart.
  That lookup was removed. It does not establish that the multimedia module's
  own service path is unavailable: the subsequent decoder lifecycle and frame
  tests succeeded. [Blocked audio/GPU probe](streaming-audio-first-attempt.txt).
- Length-prefixed AVCC input did not return a picture before draining. With EOS,
  it returned black pixels with flags 4. That is an EOS buffer, **not a decoded
  blue picture**, despite the original diagnostic label `DECODED_PIXELS`.
  Annex B input returned correct blue pixels with flags 0.
  [Without drain](streaming-h264-frame-without-drain.txt),
  [AVCC with drain](streaming-h264-frame-avcc-drain.txt).
- Bounded native code slices were inspected with Capstone after REA's available
  decompiler/disassembler providers could not handle this target. Export names
  and static disassembly are leads, not evidence of successful execution.

## What is still needed for Moonlight

1. Establish an executable-code loading route for a native ARM64 port of
   `moonlight-common-c`, or build a separate interpreted/cooperative execution
   route. Calling existing native functions is insufficient to execute the core.
2. Implement a continuous presentation path. CPU PNG uploads are a diagnostic;
   native textures or another efficient UI/GPU bridge need investigation. Resolve
   the moving fixture's chroma differences before judging image quality.
3. Adapt core sockets, threads/synchronization, timers, ENet and crypto to the
   retail process ABI. Use native audio/video through a narrow bridge.
4. Test a real Sunshine session with moving video, realistic bitrate, input,
   synchronized audio, cancellation and repeated teardown.

cpp.js/crossbind supplies compilation/bindings, not those platform services.
A subsequent [wasm2js experiment](wasm2js.md) successfully compiled the entire
upstream core to ordinary JavaScript and executed its RTSP, FEC and crypto
diagnostics on the Switch. This requires no WebAssembly, but is not a drop-in
threaded core: scheduling, native sockets and media callbacks still need adapters.
See [upstream requirements and primary sources](streaming-core-requirements.md).
