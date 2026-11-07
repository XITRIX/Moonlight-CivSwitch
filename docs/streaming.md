# Streaming prototype

The app uses the actual moonlight-common-c RTSP, ENet, RTP, FEC, crypto and input
implementations compiled to ordinary JavaScript with Emscripten/wasm2js. It does
not require WebAssembly or native ARM64 payloads. The upstream checkout remains
unmodified and pinned in `investigation/wasm2js/sources.lock.json`.

## Run

Build with the local pinned toolchain, then leave CivSwitch waiting on port 9026:

```sh
python3 -B investigation/wasm2js/bootstrap.py
python3 -B investigation/wasm2js/build.py
python3 -B tools/send_ui.py 192.168.1.182 --streaming
```

The generated core exceeds the loader's 500 KiB limit. The sender uploads it in
bounded chunks into RAM, then sends the app. No runtime or stream files are
written on the Switch. Existing pairing files remain exclusively inside
`save:/moonlight-experiment/`.

Connect, then select a game card to launch it. Selecting an already running app
resumes it. A different running app is reported without terminating it. The host
must grant this paired client permission to launch apps and receive input.
Press − and + together, or press Escape on a keyboard, to disconnect. B is sent
to the remote game. Video fills the viewport and preserves its aspect ratio;
status is visible during startup/stopping and hidden during playback. The app returns
to the cached Games screen; it does not send Sunshine `/cancel` to terminate the
host application. B from Games returns to Host; B again closes the UI.

Open Settings from Host or the Games footer to choose 360p/540p/720p,
15/30/60 FPS, and 1–10 Mbps presets. D-pad up/down chooses a setting; left/right
adjusts its value. Back/B saves to `save:/moonlight-experiment/settings.json`.
Preferences survive reloading the UI and apply to the next launch or resume,
including the core bitrate request. Defaults are 720p, 30 FPS, 5 Mbps; a selected
frame rate is a request, not a guarantee of measured playback performance.

## Data path and limits

- Launch/server-info requests use the saved client identity and pinned native
  TLS. Each stream gets a fresh secure random key and key ID. The negotiated
  plain/encrypted RTSP URL must point to the paired IPv4 host.
- Asyncify fibers implement cooperative C tasks. Socket wrappers map wasm32
  structures, options and errors to native SDK TCP/UDP. Blocking waits yield to
  preserve progress by the UI and other C tasks. There are no JS callbacks
  masquerading as native thread entry points.
- The core assembles H.264 access units and feeds a private native `movie::Decoder`
  with output format 3 and mode 2. Its native GPU transfer writes into an app-owned
  RGBA Civ VII texture. The output Buffer points to the engine's NVN texture,
  has capacity 8, and receives the renderer's NVN device through `SetNvnDev`.
  With no NVN sync supplied, the decoder finishes its copy queue before returning.
  This is a GPU copy, not a zero-copy decoder surface. No decoded pixels cross JS.
  Gameface displays a private `live:/moonlight-experiment/<id>` image, reusing its
  handle through dynamic-image invalidation. There is no PNG encoding, Base64,
  JavaScript color conversion, or per-frame texture recreation on this path.
  The default request is 1280×720, 30 fps, 5000 kbit/s. Bounded host runs sustained
  roughly 30 presented fps. Input-to-display latency is not yet measured.
- Construct the decoder before allocating MediaData/owned movie Buffers. Its
  initialization changes the allocator callbacks. Earlier probes that allocated
  configuration first crashed when destroying a buffer from the built-in pool.
  The new order passed a real stream and teardown from a fresh game process.
- Explicit `renderer: "native-texture"` retains the CPU NV12/4 MiB lookup-table
  fallback; `renderer: "png"` retains encoded-image diagnostics. Their default
  request remains 320×180 at 15 fps, with a 640×360 adapter limit. They are not
  automatic fallbacks after a native GPU error.
- Stereo 48 kHz Opus packets are decoded with the existing native Opus library
  and queued in 20 ms PCM batches to a private AudioOut instance. The output pool is bounded;
  exhausted buffers cause a drop rather than unbounded growth.
- Native SDK Npad samples forward the D-pad, all four face buttons, L/R, ZL/ZR,
  both sticks and stick clicks, and individual −/+ buttons to controller 0. The
  adapter reads existing handheld, paired Joy-Con, and Pro Controller states; it
  does not change the game's supported controller IDs or assignments. It handles
  disconnects and releases input on focus loss. Nintendo B/A/Y/X match the physical
  Xbox A/B/X/Y positions; native up-positive stick Y is preserved. Browser standard
  gamepads provide the same layout, with Y inverted from their down-positive axes.
  The combined −/+ state is consumed locally to stop streaming. Native game actions
  remain a partial fallback when full controller state is unavailable. Keyboard keys
  use Moonlight's Win32 key events. C APIs that may take locks run in a cooperative
  task, with bounded queues and coalesced controller state. Rumble, gyro, touch,
  mouse input, additional controllers and on-screen keyboard streaming are absent.
- Teardown interrupts startup or stops an active core, pumps until tasks finish,
  and then releases decoder/audio objects, sockets and owned memory. If cleanup
  times out, referenced memory is retained and further streams require restarting
  Civ VII. Existing game-owned resources are never freed.

## Validation

```sh
npm test
npm run test:ui
node investigation/wasm2js/test-core.cjs
node investigation/wasm2js/test-runtime.cjs
```

The browser suite covers card launch, key forwarding, Escape/−+ stop and
return to the grid. Protocol tests cover launch/resume, keys, pinned TLS,
permissions, cancellation and host-bound RTSP URLs. The generated-runtime tests
exercise upstream algorithms, cooperative scheduling and PNG pixels/CRCs/bounds.

For a bounded live Desktop test (starts a real session for 20 seconds):

```sh
python3 -B investigation/wasm2js/send-runtime-test.py 192.168.1.182 \
  --probe investigation/wasm2js/probe-live-gpu-texture.js \
  --extra app/src/protocol/sunshine-pairing.js \
  --extra app/src/protocol/sunshine-apps.js \
  --extra app/src/streaming/sunshine-session.js \
  --extra app/src/streaming/native-texture.js \
  --extra app/src/streaming/native-media.js \
  --extra app/src/streaming/stream-client.js \
  --output investigation/evidence/streaming-live-gpu-texture-720p.txt --timeout 70
```

Measured hardware outcomes and limitations are kept in
[live streaming evidence](../investigation/evidence/streaming-live.md).
The user confirmed live video and audio, with roughly 1 fps and laggy sound in
the first integrated run. The native Gameface texture bridge now displays generated and decoded frames; see
[direct rendering findings](../investigation/evidence/direct-rendering.md).

Launch negotiation reference:
[Moonlight Embedded gs_start_app](https://github.com/moonlight-stream/moonlight-embedded/blob/master/libgamestream/client.c).
