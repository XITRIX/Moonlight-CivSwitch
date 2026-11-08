# Streaming prototype

The app uses the actual moonlight-common-c RTSP, ENet, RTP, FEC, crypto and input
implementations compiled to ordinary JavaScript with Emscripten/wasm2js. It does
not require WebAssembly or native ARM64 payloads. The upstream checkout remains
unmodified and pinned in `investigation/wasm2js/sources.lock.json`.

Video uses H.264. The installed movie API exposes H.264, VP8, and VP9 video
decoder types and rejects HEVC MIME types; there is no working HEVC option to
expose in Settings. See the [on-console HEVC investigation](../investigation/evidence/hevc.md)
for the runtime checks and the limits of this finding.

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

Open Settings from Host or the Games footer to choose 360p/540p/720p/1080p,
15/30/60 FPS, and 1–40 Mbps presets (including 15, 20, 25, 30 and 40 Mbps). D-pad up/down chooses a setting; left/right
adjusts its value. Back/B saves to `save:/moonlight-experiment/settings.json`.
Preferences survive reloading the UI and apply to the next launch or resume,
including the core bitrate request. Defaults are 720p, 30 FPS, 5 Mbps; a selected
frame rate is a request, not a guarantee of measured playback performance.
**Frame pacing** chooses Smooth (default) or Low latency. At 60 FPS, Smooth keeps
one spare decoded frame to bridge uneven output arrival, adding up to one frame
of buffering. Low latency presents the newest ready output and skips older ones.
The spare-frame buffer is inactive at 15/30 FPS. Preferences still use the same
settings file; no additional Switch files are created.
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

Low latency drains up to 32 outputs, retaining the newest displayable timestamp
with at most two temporary slots. Smooth at 60 FPS retains the newest two ready
outputs and submits the older one, leaving one spare to bridge an empty tick.
It briefly holds at most three slots while trimming an extra acquisition. Outputs
older than two frame periods since decoder submission are discarded before
selection; non-increasing presentation timestamps are rejected. Initial priming
waits for two outputs or one frame period. Neither mode publishes more than once
per render tick, and all encoded inputs are decoded to preserve reference frames.
The overlay's **Stale skipped** count separates deliberate coalescing/catch-up from
network frame gaps and decoder rejects.

GPU output uses an owned NVN sync object passed through `Buffer::SetNvnSync`.
The early output check queues a native copy, then packet processing overlaps its
execution. Zero-timeout fence polls publish only completed copies and release the
selected decoder slot afterwards. An unfinished transfer retains its slot and
prevents another submission. No GPU queue-finish or blocking fence wait runs per
frame. CPU NV12/PNG diagnostics retain their synchronous path. On uncertain GPU
submission/completion/release failures, native resources are quarantined and a
restart is required rather than freeing memory still possibly in use.

The overlay's GPU submit time measures CPU time in the native transfer call.
Decoder-to-texture time spans decoder submission to publication, including pacing
and polling, and excludes host, network, physical input and display scanout. The
internal completion metric is time to observing a signaled fence, not exact GPU
execution time. The copy/present counter excludes overlapped GPU execution; fence
poll CPU cost is tracked separately.

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

Send, single receive and zero-timeout poll borrow validated ranges of the core's
native backing memory synchronously. The tested SDK also exposes native
`RecvMMsg`: connected video/audio UDP sockets can fetch up to 32 available
datagrams per call into a private 132.5 KiB region of the core heap (packet slots
plus message headers and iovecs). Result lengths are read through DataView in
that same heap, avoiding arbitrary native-memory reads per packet. It never waits
to fill a batch. Each C receive copies one complete datagram within that heap
using `copyWithin`; there is no per-byte JS loop or per-packet ROP memcpy.
Two independent slots preserve packet boundaries, order, peek and truncation.
Poll merges readiness from cached datagrams. TCP, source-address receives and
extra UDP sockets keep single-receive handling. Unknown SDK signatures disable
batching. Sockaddr and option translation retain their small native buffers.
Replacement heaps revalidate pointers and rebuild native iovecs before reuse.
Cancellation takes precedence over cached packets, and scratch memory is freed
only during normal I/O cleanup after C tasks finish. Packet-type diagnostic
strings are formatted at sampling time. Telemetry records native receive calls,
batch packets/cache hits and copied bytes. See the
[40 Mbps measurements](../investigation/evidence/quality-40mbps.md).
The separate compressed-video copy into the movie decoder remains.

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
callbacks stop. Each iteration first tries video, then runs two cooperative C
pumps (budgets detailed below). A fence check between them releases completed
video promptly. At 40 Mbps, if the early drain did not submit or publish video, one mid-frame
decoder check can use output that became ready during the first pump. A retained
transfer occupies the tick even if its fence completes, preventing duplicate
submissions. The second fence check covers later completions without expanding
the one-spare-frame buffer or its two-period age limit.
The final check may repeat nonblocking fence queries for at most
3 ms and 32 retries, capped by remaining frame headroom (the C budget plus
2 ms: 12 or 14 ms since work began). If C consumed that headroom, no retry wait is added. This avoids deferring
a nearly completed copy by an entire render tick when the second C pump ends
early. Each individual native query can still overrun; it cannot be preempted.
Pending audio drains afterwards. Each pump prioritizes input. GPU submission,
publication and fence-poll CPU costs remain outside the measured core budgets.
Socket loops and media callbacks check their current pump's deadline and
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
`InputSend` task, before the regular round-robin pass. All tasks in a pump share its
deadline; the two per-frame pump budgets total 10 ms (4+6). Demanding 60 FPS
modes—above 720p or at least 8 Mbps—use 12 ms, allowing more receive/audio
work. Below 40 Mbps this is split 6+6 ms; at 40 Mbps it is split 4+8 ms so a
mid-frame submission has longer to complete on the GPU. This keeps incoming video/audio packet work from consuming the
budget before newly sampled controller state can reach the socket. The pinned
upstream thread name selects the input sender; upstream protocol, encryption,
reliability and controller packet formats are unchanged.
Queuing a controller update or key also wakes the sleeping dispatch task, so it
does not wait for its 4 ms polling sleep to expire before the next priority pass.

The input timing probe correlates neutral controller updates with ENet channel 16
reliable sequence numbers and host acknowledgements. Sample-to-socket time measures
the local queue and encoding path; socket-to-ACK includes the client's receive
polling delay. Neither measures Bluetooth button age, host game response, capture
cadence or physical display scanout. Retransmission counts are not a Wi-Fi loss
percentage: delayed ACK servicing can also trigger retransmission. Under continuous
input, intentional coalescing can prevent one-to-one sample/packet correlation;
the probe suppresses sample-based timing when not every update has a matching send.
New send matching stops at stream interruption; teardown's neutral-controller
packet cannot satisfy a measured sample. Sparse samples are used for the final
1080p latency check to avoid ambiguity from continuous-state coalescing.

## Data path and limits

- Launch/server-info requests use the saved client identity and pinned native
  TLS. Each stream gets a fresh secure random key and key ID. The negotiated
  plain/encrypted RTSP URL must point to the paired IPv4 host.
- Asyncify fibers implement cooperative C tasks. Socket wrappers map wasm32
  structures, options and errors to native SDK TCP/UDP. Blocking waits yield to
  preserve progress by the UI and other C tasks. There are no JS callbacks
  masquerading as native thread entry points.
  Video packet size is 1392 bytes for this IPv4 LAN client, reducing per-packet
  socket/fiber overhead while leaving room for RTP/UDP/IP and encryption headers
  within a 1500-byte MTU. It is not an Internet path-MTU discovery mechanism.
- The core assembles H.264 access units and feeds a private native `movie::Decoder`
  with output format 3 and mode 2. Its native GPU transfer writes into an app-owned
  RGBA Civ VII texture. The output Buffer points to the engine's NVN texture,
  has capacity 8, and receives the renderer's NVN device through `SetNvnDev`.
  An owned NVN sync allows asynchronous transfer; the app checks completion before
  publication and decoder-slot release. This is a GPU copy, not a zero-copy
  decoder surface. No decoded pixels cross JS.
  Gameface displays a private `live:/moonlight-experiment/<id>` image, reusing its
  handle through dynamic-image invalidation. There is no PNG encoding, Base64,
  JavaScript color conversion, or per-frame texture recreation on this path.
  The default request is 1280×720, 30 fps, 5000 kbit/s. Native stream settings
  allow up to 1920×1080, 60 fps, 40000 kbit/s. Above 720p, the compressed
  native input buffer requests 1 MiB instead of 256 KiB to accommodate larger
  keyframes; every submitted frame is still checked against actual capacity.
  See the [1080p measurements](../investigation/evidence/quality-1080p.md) for
  delivered FPS, input, audio and exit checks. Input-to-display latency is not
  yet measured.
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
