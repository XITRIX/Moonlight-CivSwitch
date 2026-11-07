# Streaming runtime and live session evidence

2026-11-07. Switch 2, Civ VII cartridge 1.0.0, existing CivSwitch loader.
Switch `192.168.1.182`; paired Sunshine-compatible host `192.168.1.4`.
No additional files were created on the Switch by these tests.

## Cooperative runtime

`streaming-runtime-console-3.txt`: generated wasm2js core initializes with
WebAssembly and Worker unavailable. Two C workers, mutex/event, timed yields
and joins complete with result 42 and zero remaining tasks. C HTTP through
native SDK sockets plus a native UDP loopback completes with result 42.

Earlier `streaming-runtime-console.txt` and `-2.txt` show an alignment failure:
an optimized HTTP status comparison was wrong despite correct bytes. Aligning
the C task stacks to 16 bytes fixes it. The first two logs are failure evidence,
not successful runtime checks.

## Native media adapters

`streaming-media-adapter.txt`: a generated moving 320×180 H.264 fixture runs
through the app's native adapter: 16 submitted/decoded frames, 7 displayed PNG
previews. Native stereo Opus and AudioOut process 48 packets, queue 48 buffers,
and report no pool drops. This validates known fixtures, not audio from the host.

## Real host sessions

`streaming-live-console.txt` and `-2.txt`: host launch initially rejects the
paired client with XML status 403, “Permission denied.” The user enabled launch
permission before the successful runs.

`streaming-live-console-3.txt`: all 11 core stages complete, a real session starts,
and the native movie adapter decodes 175 frames in the bounded test. Static
duplicate image URLs exposed a presentation stall: assigning an unchanged URL
does not necessarily fire another load event. Fixed by recognizing identical
URLs before setting the image-loading flag, with a bounded load wait.

`streaming-live-console-4.txt`: all stages complete again. Over the bounded
20-second run, 181 access units are submitted, 176 decoded, and 34 previews
actually fire image load events. It then completes core teardown and native
resource cleanup, and returns the loader successfully. Expected shutdown ENet
interrupt messages do not cause a failed result.

Audio traffic is detected, but these two Desktop runs report no Opus packets
delivered to the audio adapter. End-to-end host audio is **not established by
these logs**. Generated-fixture Opus/PCM output is established separately.
Remote input transport is wired, but these logs do not independently verify
the host's response to physical controller presses.

`streaming-ui-console.txt`: integrated app run for user validation. This is a
sender log. The user confirmed visible live frames at roughly 1 fps and audible
but laggy sound. When the host played audio, the log recorded 944 decoded Opus
packets, 528 queued AudioOut buffers and 416 pool drops. This establishes the
host-to-speaker path and its poor continuity; it does not establish usable audio
latency or quality. The user subsequently stopped streaming and closed the UI.

`streaming-media-adapter-fast.txt`: a direct typed-array RGB encoder still took
2211 ms total across 7 conversions (worst 329 ms). The indexed-color variant in
`streaming-media-adapter-indexed.txt` reduced that to 1004 ms across 8 conversions
(worst 241 ms, including initial table creation); all 8 images loaded. The app
now batches 5 ms Opus packets into 20 ms PCM buffers to reduce native queue
calls. The optimized live audio result has not yet been user-verified.
Further investigation follows the game's native `live:/` texture path, documented
in [direct rendering findings](direct-rendering.md), to avoid encoded images.

## Native live-image renderer

The native presenter is now implemented and is the app's default on the tested
Civ VII build. The user confirmed a generated color image and an animated
gradient using app-owned renderer textures. No PNG encoding or Base64 is involved.

`streaming-live-native-texture.txt`: 198 decoded / 87 presented native frames;
conversion/upload averaged about 107 ms. This identified color conversion as
the next bottleneck after removing encoded images.

`streaming-live-native-texture-fast.txt`: with the prepared color lookup table,
202 decoded / 169 presented frames, about 8.8 presented fps over 19.164 seconds.
Conversion/upload averaged 19.3 ms, worst 20 ms. Clean teardown left zero C tasks.
Only a brief audio burst was present, with no adapter pool drops; this does not
establish continuous audio quality. The integrated UI was then loaded for user
testing with a moving video and sound (`streaming-ui-native-texture.txt`).

The six-bit chroma table occupies 4 MiB in RAM, preserves every luma level, and
is prepared with yields before starting the host session. This is CPU conversion
and native texture upload, not a zero-copy decoder/GPU surface. Resolution and
the requested frame rate remain 320×180 at 15 fps pending further profiling.

## Local checks

`npm test`: pairing, transport, app-list/artwork, storage and stream negotiation
checks pass. `npm run test:ui` passes with card launch, keyboard forwarding,
Escape and hold-B stop, and cached-grid restoration. The browser test requires
Chrome outside the sandbox in this environment. `test-runtime.cjs` verifies
cooperative tasks and NV12→PNG dimensions/pixels, PNG CRCs, zlib integrity and
invalid bounds. These checks complement hardware results; they do not establish
smooth gameplay or low latency in the console's jitless engine.

## Native GPU output — 2026-11-08

The renderer now defaults to 1280×720 H.264, 30 fps, 5000 kbit/s. The native movie
mode writes into an app-owned NVN texture through its own GPU copy queue. Decoded
pixels no longer cross the JS heap, and the CPU color lookup table is not prepared
on this path. This is a GPU copy into a presentation texture, not zero-copy decode.

- `streaming-live-gpu-texture-720p.txt`: 531 submitted, 524 decoded/presented;
  485 ms total transfer/publication, worst 9 ms. After startup, successive two-second
  intervals present about 60 frames. The host supplied 3141 Opus packets, queued as
  785 PCM batches with zero adapter pool drops. Shutdown completed with state 0,
  zero C tasks, no error, and the loader's completion marker.
- `streaming-live-gpu-texture-fresh.txt`: repeated from a freshly restarted game,
  with no earlier native probes. 566 submitted, 561 decoded/presented over 19.033 s
  after first image (about 29.5 fps). Transfer/publication totaled 529 ms, worst
  9 ms. Clean shutdown and loader return. No host audio reached the adapter in
  this run, so it independently validates video/cleanup, not continuous sound.
- `streaming-ui-gpu-texture.txt`: integrated app run with continuing video and audio
  traffic. The user reported “Much better — stop works,” covering picture detail,
  motion/audio improvement, and hold-B returning to Games. This is a subjective
  quality check; input-to-display latency and long-session stability remain unmeasured.

Initialization order matters. The original native GPU probes constructed the
H.264 configuration before the decoder. A configuration alone could be destroyed,
whereas destroying it after decoder initialization crashed. Bounded snapshots in
`streaming-config-ownership.txt`, `streaming-config-buffer.txt`, and
`streaming-config-data.txt` established separate, valid original/copied AVCC buffers.
The original allocation was inside the built-in Buffer pool; the copy used the
installed allocation callbacks. Native Buffer deallocation checks its holder's
location and uses those callbacks outside its built-in pool. The retained original
was explicitly released through its original pool in
`streaming-config-retained-cleanup.txt`, after which normal metadata cleanup passed.
The application fixes the lifetime by constructing the decoder **before** MediaData
and owned Buffers. Both fresh-process startup and teardown passed. The application
contains no retained-probe cleanup or allocator repair code.

`streaming-decoder-modes.txt`, `streaming-gpu-config.txt`, `streaming-gpu-frame.txt`,
and `streaming-gpu-frame-config-release.txt` preserve failed attempts. Their missing
loader completion markers do not establish successful cleanup. The corrected tiny
frame test is `streaming-gpu-frame-ordered.txt`; it decoded, transferred, displayed,
and released its objects, then returned to the loader. The user thought they saw
blue during the first, crashing frame attempt; that observation alone was tentative.
The later real streaming runs establish functioning presentation.

All these console probes operate in RAM. No new experiment-owned Switch files
were written outside `save:/moonlight-experiment/` (the GPU probes write none).

## Fullscreen and physical controller input — 2026-11-08

`streaming-input-exports.txt` records SDK HID getters and a browser `getGamepads()`
result of `[]`. Browser gamepad forwarding alone therefore cannot provide full
Switch controls. `streaming-input-code.txt` and its exact AArch64 disassembly
establish the native getters' reference-to-u32 controller ID, owned output/count
arguments, Result return, and 40-byte FullKey/Handheld state copy. The sampling
number, button mask, two stick pairs, and attributes occupy offsets 0, 8, 16/24,
and 32. Public wrappers abort on errors; the adapter uses the existing Result-returning
`hid::detail` functions. No HID initialization, ID/style configuration, controller
reassignment or vibration calls are made. The bounded Hopper analysis attempt
was stopped when it did not finish; no completed REA function dossier is claimed.

`streaming-input-state.txt` runs the app's adapter against the real controller for
120 polling iterations, obtains 120 neutral connected samples, closes the adapter,
and returns the loader. This validates neutral-state polling and owned-memory
cleanup. It does not alone establish every physical button or the host's response.
The button/style reference is the primary switchbrew/libnx HID header:
https://github.com/switchbrew/libnx/blob/master/nx/include/switch/services/hid.h
Native getter code and runtime samples establish the ABI for this game.

The app now presents the native video image across the viewport using aspect-fit
sizing with a black background. Status hides after the first image and returns
while stopping. Controller 0 receives both sticks/clicks, D-pad, face buttons,
shoulders, ZL/ZR and individual −/+ buttons. Face buttons match physical Xbox
positions (Nintendo B/A/Y/X → A/B/X/Y). The combined −/+ state is local exit;
B remains gameplay input. Full native/browser state suppresses duplicate partial
UI actions. Disconnect/focus loss clears held controller and keyboard state.

Local checks cover native/browser mapping, axis bounds/dead zone, trigger values,
controller disconnection and allocation cleanup. Browser checks cover viewport
bounds, hidden playback status, B held without exit, both sticks/triggers,
neutral state on blur/disconnect, and −/+ exit without forwarding the combined
menu-button state. `npm test` passes 16 tests; `npm run test:ui` passes.
The integrated hardware run is `streaming-ui-fullscreen-input.txt`; user validation
of fullscreen, remote controls, and the new exit chord is recorded after testing.

The user confirmed “Fullscreen, controls, and exit work” on the integrated Switch
build. This establishes the requested fullscreen presentation, remote control
behavior, and −/+ return to Games in the user's test. It is not an exhaustive
button-by-button compatibility test across controller styles or host games.
