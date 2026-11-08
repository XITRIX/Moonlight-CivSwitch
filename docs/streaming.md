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
The saved **Performance overlay** preference (Off by default) displays interval
statistics during playback. Missing host data appears as a dash.

## Performance measurements

`telemetry.js` samples once per second using actual elapsed monotonic time where
available. FPS counts decoded frames and submissions to the shared Gameface
texture; it does not measure scanout. Network RX includes protocol/FEC/audio
traffic. RTT and RTT variation come from ENet's upstream estimate, rather than
one-way video delay. Frame receive time spans the first packet to assembly; core
queue delay spans assembly to the submit callback. Host processing time is
Sunshine metadata when present, averaged only over frames that supply it.

Decode-ready time matches successful native decoder inputs to acquired output
timestamps, including polling/scheduling delay. GPU copy/presentation time is
measured separately. Texture interval jitter is the standard deviation of
submission intervals in the sample window; it is not network jitter. The native
decoder's pending count is submitted minus acquired outputs. Buffered audio is an
upper bound from unreclaimed PCM buffers plus staging; it includes the whole
currently playing buffer and buffers that have finished since the last reclaim.

The renderer drains ready outputs before copying to the shared texture, retaining
the newest displayable timestamp and releasing superseded frames. Each drain is
bounded to 32 outputs and holds at most two slots. All acquired slots are released
on format/presentation errors. Encoded H.264 inputs are still decoded to preserve
reference frames. The overlay's **Stale skipped** count tracks this deliberate
presentation coalescing separately from network frame gaps and decoder rejects.
Texture submissions can consequently be fewer than decoded frames: older outputs
are no longer copied repeatedly into the same texture during a single drain.

Audio uses fixed 20 ms PCM chunks, two native buffers (40 ms), and one replaceable
software chunk (20 ms). The completed-PCM budget is 60 ms; partial staging adds
less than 20 ms (normally at most 15 ms for Sunshine's 5 ms packets). Pending audio
is drained between cooperative pumps as native capacity becomes available. When
there is room, pending samples are preserved in order. On sustained backpressure,
only the stale software chunk is replaced; active AudioOut buffers are never
overwritten, and playback is not stopped or restarted. Every Opus packet is still
decoded so dropping PCM does not corrupt decoder state. Long decoded packets are
split into the same bounded chunks. The overlay reports deliberately skipped
audio duration, separate from network FEC failures. This trades stale audio for
bounded buffering when the scheduler or network falls behind.

Loss indicators are video frame-number gaps, native decoder rejections, audio
packets recovered by FEC, failed audio recovery blocks, and local audio-buffer
drops. They are not a raw packet-loss percentage. The pinned upstream video FEC
recovery/failure counters are declared but never populated, so the overlay does
not present their zero values as measurements. Direct-submit mode also bypasses
the upstream renderer queues, so those queue APIs are not used here.

Both send and receive calls now borrow validated ranges of the generated core's
native backing memory synchronously. Payloads no longer pass through the 2 MiB
scratch allocation or a per-packet native memcpy. Sockaddr, poll and option ABI
translations retain their small native buffers. Full-heap views, ranges and backing
pointers are validated; replacement heaps trigger pointer validation again.
Telemetry records direct byte totals to verify this path during hardware runs.
This does not remove the separate compressed-video copy into the movie decoder.

The core exposes a versioned read-only metrics snapshot while connected, queried
between cooperative pumps. The upstream checkout remains unmodified. Newly
uploaded runtime digests replace cached factories so a UI reload uses the rebuilt
core. Large pre-stream console reports are split below CivSwitch's native log-buffer
limit. Once a stream starts, diagnostics stay in RAM for the rest of that UI session:
`window.__moonlightStreamDiagnostics` holds the latest statistics and the last 64
messages (at most 512 characters each). This avoids blocking the JS/input loop in
the loader's TCP logger during Wi-Fi trouble. The overlay still updates once a
second. Diagnostics are not automatically flushed to the network on exit.

The stream loop runs on animation callbacks, with a 50 ms watchdog when rendering
callbacks stop. Each iteration first checks completed video, gives cooperative C
tasks a 10 ms budget, then drains pending audio. Checking video before the packet
pump reduces empty-check/multiple-output alternation at 60 FPS. There is still at
most one texture publication per tick and no added decoded-frame queue. GPU copy
and driver wait time remain outside the measured core budget. Socket loops and media callbacks check that deadline and
yield before starting more work. This is a cooperative limit: an individual native
call or codec operation can still exceed it. The overlay reports loop frequency
and average pump/drain costs so scheduling stalls can be distinguished from RTT.
Stopping explicitly wakes a pending frame wait.

The stream screen also checks the local −/+ exit chord on a 50 ms timer, including
when animation callbacks stop or remote input is suspended. Stop immediately
interrupts the core and prioritizes its teardown task. Neutral controller state
and queued key releases get a fixed grace of at most 100 ms; this deadline cannot
be extended by repeated stop requests. After it expires, connect/send/receive/poll
return a fatal local cancellation result without entering the native socket API.
Other operations remain available for C teardown. Interrupted sleeping tasks wake
immediately, and teardown advances on short timers rather than rendering callbacks.
Owned decoder/audio/socket memory is released only after C tasks end,
and the existing unfinished-task safeguard still applies. This is a cooperative
exit path; it cannot preempt an individual blocking native driver call.

Each pump first gives the controller-dispatch task one turn, followed by upstream's
`InputSend` task, before the regular round-robin pass. All tasks share the same
10 ms deadline. This keeps incoming video/audio packet work from consuming the
budget before newly sampled controller state can reach the socket. The pinned
upstream thread name selects the input sender; upstream protocol, encryption,
reliability and controller packet formats are unchanged.

The input timing probe correlates neutral controller updates with ENet channel 16
reliable sequence numbers and host acknowledgements. Sample-to-socket time measures
the local queue and encoding path; socket-to-ACK includes the client's receive
polling delay. Neither measures Bluetooth button age, host game response, capture
cadence or physical display scanout. Retransmission counts are not a Wi-Fi loss
percentage: delayed ACK servicing can also trigger retransmission. Under continuous
input, intentional coalescing can prevent one-to-one sample/packet correlation;
the probe suppresses sample-based timing when not every update has a matching send.

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
  and queued in 20 ms PCM chunks to a private AudioOut instance. The native queue
  and software waiting chunk are bounded as described above. Only the used PCM
  range is flushed from CPU cache before submission.
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
