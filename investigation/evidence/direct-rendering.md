# Direct rendering investigation

2026-11-07, actual Civ VII cartridge 1.0.0 runtime on the user's Switch 2.
The initial API probes read metadata and game resources. Later tests created
and updated private experiment textures, then unregistered them and released
the experiment’s references. No probe modified game-owned images or wrote Switch
files. Failed probes and transport fixes are described below.

## Confirmed native texture path

The installed `/base-standard/ui/mini-map/panel-mini-map.css` line 47 uses
`background-image: url("live:/minimap")`. The installed
`/base-standard/ui/unit-actions/unit-actions.js` lines 472–474 calls
`WorldUI.requestPortrait(unitType, unitType, backgroundAsset)` and sets a
`live:/${unitType}` background. See `direct-rendering-game-textures.txt` and
`direct-rendering-minimap.txt`. These are native engine textures presented by
Gameface, without converting each frame into a PNG.

Official Gameface documentation describes the corresponding architecture:
`IAsyncResourceResponse::ReceiveUserImage(const UserImageData&)` registers a
renderer texture, with a nonzero image handle for dynamic content, and
`System::UserImagesChanged(const unsigned* images, unsigned count)` invalidates
changed handles. The `Texture` field is a renderer-specific native object, not
an arbitrary CPU RGBA/NV12 pointer. Registration, upload, lifetime and thread
ownership must match Civ VII's renderer.

Sources:
[Live Views](https://docs.coherent-labs.com/cpp-gameface/integration/optional_features/liveviews_native/),
[User Images](https://docs.coherent-labs.com/cpp-gameface/performance_optimization/preloaded_resources/preloadedimages_native/).
These current docs explain the architecture; they do not establish the exact
ABI of the older game build.

## Exposed JavaScript surface

`direct-rendering-api.txt` inventories the runtime's UI, WorldUI, engine, canvas
and 2D context properties. UI exposes icon URL lookup, while WorldUI exposes
portrait/model requests. No raw image upload method appeared on those objects.
The 2D context has `drawImage`, but no `createImageData`, `getImageData` or
`putImageData`. This agrees with the official
[Canvas support table](https://docs.coherent-labs.com/cpp-gameface/content_development/supported_features_tables/canvassupport/).
The search is bounded to these objects; it is not proof that no private native
entry point exists.

## Native entry points and remaining gap

`direct-rendering-entrypoints.txt` finds Renoir image/buffer APIs in the loaded
main module, including CreateBufferForSurface, image decoding and native image
encoders. No exported Cohtml System/UserImagesChanged entry point appeared in
this dynamic symbol search. Finding a buffer allocator does not establish a way
to register or update a visible image.

`direct-rendering-callbacks.txt` follows the loader's established V8 metadata
layout, without modifying it. requestPortrait, releasePortrait, getAssetNames
and getIconURL all enter the same callback at main offset `0x1a6eda0`.
A bounded 2048-byte code slice was inspected with REA/Hopper. It dispatches
through shared binding machinery, including a call to `0x21603f0`; it is not a
standalone portrait texture uploader. Static evidence:
`direct-rendering-binding-analysis.json`, REA evidence
`ev_e16f1f45883867f7304b7c233cb93210593c6eb60a8d847fe1e6c2b53ac8c4fd`.
The excerpt omits the dispatch target and renderer implementation; its
decompilation cannot establish their behavior. The temporary native analysis
session was closed.

## Implemented native presenter

The actual handler is framework field `+0x178`, with resource requests at main
`0x4c8ccc`. Its live-image response at `0x4c999c` looks up a 16-bit renderer
handle, reads dimensions/format from `0x771100`, and passes a packed native
texture reference to Gameface. This is observed static behavior, not the modern
SDK's opaque-pointer ABI. REA evidence:
`ev_f978531db4ec3325c2bb705881fdbfa30a1680578fe8ec5c8dfd667caa08d562`.
Framework `+0x158` is a file-listing handler, not the image resource handler.

`app/src/streaming/native-texture.js` implements the tested build-specific path:

| Main offset | Observed role |
| --- | --- |
| `0x771750` | Create a texture from an owned descriptor and initial pixels |
| `0x7716d0` | Replace pixels/resource for the same texture handle |
| `0x4bbb90` | Register a private name in the live-image provider |
| `0x4bc7a0` | Mark the registered image dynamic |
| `0x4bc570` | Queue a changed handle through the provider's lock |
| `0x4bcb60` | Game's per-frame delivery to System vtable slot `+0xb0` |
| `0x4bc160` | Unregister the private live-image name |
| `0x7817c0` | Release a reference through deferred renderer deletion |

The texture descriptor is `0x448` bytes, format 28 (tested RGBA), type 0,
one mip, dimensions at `+0x10/+0x14/+0x18`, initial pixels at `+0x20`.
The replacement wrapper uses six integer arguments and reaches the same creation
implementation, retaining the texture handle. It is not a zero-copy decoder
surface or an established optimal GPU subimage update. The adapter checks memory
permissions and known function-entry instructions before creation. Those checks
catch mismatches; they are not a complete build fingerprint. Offsets and layouts
are supported only for the tested cartridge 1.0.0/CivSwitch combination.

`direct-rendering-owned-texture-test.txt`: a private 64×64 texture was created
and displayed for 20 seconds. The user confirmed four colored squares. Lookup
verified registration and removal. Cleanup released the experiment's reference;
Gameface retained one reference for its resource/cache lifecycle.

`direct-rendering-owned-texture-motion.txt`: 100 changes to that private texture
completed, followed by unregister/release and loader return. The user confirmed
animated colors, though at a low rate. Native replacement/invalidation totaled
27 ms, worst 1 ms. This excludes the probe's slow scalar pixel writes and its
100 ms timer; it is not an end-to-end frame-rate benchmark.

`streaming-live-native-texture.txt`: a real Desktop session decoded 198 frames
and presented 87 native frames over 19.146 seconds after its first image, then
completed cleanup with zero core tasks. Conversion/upload totaled 9300 ms,
worst 108 ms. This established native presentation at about 4.5 fps and exposed
JS color conversion as the next bottleneck. The optimized lookup-table run is
recorded separately. Smooth gameplay and low latency remain unestablished.

`streaming-live-native-texture-fast.txt`: the prepared 4 MiB color lookup table
reduced conversion/upload to 3259 ms across 169 presented frames (19.3 ms average,
20 ms worst). The real host session decoded 202 frames, presented about 8.8 fps
over 19.164 seconds, and shut down with zero core tasks. The table preserves
8-bit luma and quantizes chroma to six bits; sampled local comparisons bound the
resulting channel error to seven levels. Audio had only 34 decoded packets and
eight queued batches in this mostly idle Desktop run, so sustained live audio
quality needs a host playing sound.

Captured code and REA evidence are in `direct-rendering-texture-analysis.json`.
Additional exact AArch64 disassemblies cover texture operations, reference
release, registration and dynamic-image state. These static observations guided
the runtime tests; they do not independently prove thread safety on other builds.

## Probe transport correction

Several earlier code scans disconnected/crashed; their incomplete logs do not
establish successful probes. Inspection of CivSwitch `core.js` showed its remote
logger allocating `line_buf = malloc(2048)` and calling `write_string` without a
length check. Several code-dump lines exceeded that allocation, providing a
concrete memory-corruption cause. A separate early metadata probe also contained
an unchecked RTTI dereference, which was removed.

`probe_transport.py` now wraps investigation logging in bounded chunks and
reassembles complete lines on the Mac. Tests exercise long ASCII, control
characters, surrogate-pair boundaries and fragmented TCP reads. Subsequent
bounded code and texture probes completed successfully. Switch pointer reads
are additionally validated against memory-query ranges. The fix changes our
probe transport, not the installed CivSwitch loader.

## Native decoder-to-texture transfer — 2026-11-08

Read-only captures in `streaming-output-validation.txt` establish the H.264
validator at movie offset `0x2b61ff0`: native texture output uses format 3, mode 2;
CPU NV12 uses format 4, mode 1. CPU format 2 is conditional on a compatibility
helper and was not established as usable. The earlier array `[0,4,1,65,66]` in
`streaming-color-functions.txt` is a **codec** mapping, despite that probe's label.
The output mapping at movie `0x36497b8` is `[2,2,3]` for formats 2–4.
REA validator evidence: `ev_8afb2aac291b4f6e31c3f874a315fe2a34709abd3acccd8b4da1c43563d65acf`.

`streaming-output-texture.txt`, `streaming-output-transfer.txt`,
`streaming-output-copy.txt`, and `streaming-gpu-transfer.txt` trace output from the
public method through implementation slot `+0x78`, `0x2b5abc0`, and `0x2b6a380`.
Slot `+0x90` is GetLastError; it is not GetOutputBuffer. The native path consumes
Buffer.Data as an NVN texture pointer, reads device/sync fields, copies from its
internal texture, and completes the copy queue when sync is null. GPU-transfer REA
evidence: `ev_3a6a2825633b54d61dfe78228a276e3919d647803d6417e16eb32a9ad35d1c2e`.

The engine getter at **main** `0x781a10` selects the current 216-byte NVN texture
object from an owned u16 handle. The renderer's device is reached through the
pointer slot at main `0x4db9ed8` and a second dereference. These offsets belong to
the main module; decoder offsets belong to the separate movie module.
The application validates memory permissions and the getter entry word, binds the
owned texture to a movie Buffer with capacity 8 and SetNvnDev, and publishes only
after successful transfer. It reuses the texture object and live-image handle.

The current default native GPU path bypasses the earlier NV12 lookup conversion
and texture recreation. The CPU path remains available explicitly. The bounded
720p host tests sustain about 30 presented fps with roughly 1 ms average native
transfer/publication. See [live evidence](streaming-live.md) for audio, fresh-start,
cleanup, user confirmation, and the allocator initialization fix. Other game builds,
zero-copy surfaces, HDR, higher resolutions, and end-to-end latency remain untested.

## Fence-based GPU transfer — 2026-11-08

The decoder's existing `Buffer::SetNvnSync` path imports an initialized sync's
fence, submits the copy, fences/flushed its own queue and returns an updated sync
instead of finishing the queue on the CPU. The earlier transfer capture remains
the static basis (`ev_3a6a2825633b54d61dfe78228a276e3919d647803d6417e16eb32a9ad35d1c2e`).
`gpu-sync-code-switch.txt`, `gpu-sync-fence-code-switch.txt` and
`gpu-sync-wait-tail-switch.txt` read the pointer cells and bounded driver code;
they do not patch those cells or functions. The app initializes only its owned
sync allocation and binds it to its own movie Buffer.

| Movie-relative cell | Observed role |
| --- | --- |
| `0x4038698` | Initialize sync with device; clears its state |
| `0x4038610` | Finalize sync |
| `0x4038720` | Client wait with nanosecond timeout; app uses zero |
| `0x4038708` | Fence sync on decoder's copy queue |
| `0x4038710` | Flush queue |
| `0x4038718` | Finish queue, used by the old null-sync path |

REA analysis of the normalized driver captures is preserved in
`gpu-sync-functions-analysis.json`, `gpu-sync-get-fence-analysis.json`, and
`gpu-sync-wait-results-analysis.json`. Evidence IDs are
`ev_8fae6b1068a3af49b547310b2517dc1349521ee8d0bd7921075b888091c1e573`,
`ev_44a5cde594d0298c34c159f9ea97af5940d1c5fbff966450b1a517be60c1225b`, and
`ev_39cce5666b8ed71b3bcecbdd31e999766fada384a5a3ee46888ce69c7c858fe5`.
These are partial native captures with recovered types/control flow; they are
not a complete public NVN ABI. The tested return handling is 0/1 completed,
2 timeout/pending, and 3 failure. Decoder output ownership is retained across
pending polls, and publication/release happen only after completion.

`gpu-fence-wait-switch.txt` first retained synchronous completion: 973 copies
queued in 251.221 ms total, then waited 2333.551 ms; all waits returned 1, with no
fallbacks. The app then moved completion checks between/after 4+6 ms core pumps.
A bounded one-spare-frame pacer was needed for 60 FPS consistency; removing CPU
waits alone did not improve delivery. `gpu-overlap-summary.json` records isolated
59.52 texture FPS and full-UI 57.07 FPS, plus input and stop checks. It also records
one unresolved repeated-run startup crash; the fresh-process 30 FPS check passed.
Native analysis sessions were closed. Physical scanout and end-to-end control
latency remain unmeasured; Smooth pacing can add one frame of buffering.
