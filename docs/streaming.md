# Streaming prototype

The app uses the actual moonlight-common-c RTSP, ENet, RTP, FEC, crypto and input
implementations compiled to ordinary JavaScript with Emscripten/wasm2js. It does
not require WebAssembly or native ARM64 payloads. The upstream checkout remains
unmodified and pinned in `third_party/sources.lock.json`.

Video uses H.264. The installed movie API exposes H.264, VP8, and VP9 video
decoder types and rejects HEVC MIME types; there is no working HEVC option to
expose in Settings. See the [on-console HEVC investigation](../investigation/evidence/hevc.md)
for the runtime checks and the limits of this finding.

## Run

Build with the local pinned toolchain, then leave CivSwitch waiting on port 9026:

```sh
python3 -B tools/wasm2js/bootstrap.py
python3 -B tools/wasm2js/build.py
python3 -B tools/send_ui.py 192.168.1.182
```

Streaming is enabled by default; `--no-streaming` skips the core upload for
UI-only debugging. The generated core exceeds the loader's 500 KiB limit. The sender uploads it in
bounded chunks into RAM, then sends the app. No runtime or stream files are
written on the Switch. Existing pairing files remain exclusively inside
`save:/moonlight-experiment/`.

Connect, then select a game card to launch it. Selecting an already running app
resumes it. A different running app is reported without terminating it. The host
must grant this paired client permission to launch apps and receive input.
Press − and + together, or press Escape on a keyboard, to open stream options.
The left drawer uses CivHomebrew's options style and the connected host's name
as its title. **More → Show keyboard** opens controller keyboard mode, while
**More → Touchscreen mode** offers Trackpad / Touchpad choices. Mode changes
apply immediately and are saved for future streams; a failed save leaves the
active mode unchanged. **Logout** opens the existing alert: choose **Disconnect**
to leave the PC app running, or **Terminate** to disconnect and close it. B in
the alert returns to Logout; B in submenus goes back one level, and B at the
drawer root returns to the stream. Outside local controls, B is sent
to the remote game. Video fills the viewport and preserves its aspect ratio;
status is visible during startup/stopping and hidden during playback. On return,
the Games screen refreshes the running-app state while reusing cached covers.
B from Games returns to Hosts; B again closes the UI.

Open Settings from Hosts or the Games footer to choose 360p/540p/720p/1080p,
15/30/60 FPS, and 1–80 Mbps presets (including 40, 50, 60, 70 and the experimental 80 Mbps). D-pad up/down chooses a setting; left/right
adjusts its value. A on Bitrate opens all choices; D-pad chooses, A applies and
B cancels the dropdown. Back/B from Settings saves to `save:/moonlight-experiment/settings.json`.
Preferences survive reloading the UI and apply to the next launch or resume,
including the core bitrate request. Defaults are 720p, 60 FPS, 20 Mbps; a selected
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
software chunk (20 ms). AudioOut starts once both native buffers are queued, giving
a one-time 40 ms prefill. Opus decodes directly after the retained partial chunk
in native staging, removing the former intermediate PCM allocation and copy.
The completed-PCM budget is 60 ms; partial staging adds
less than 20 ms (normally at most 15 ms for Sunshine's 5 ms packets). Pending audio
is drained between cooperative pumps as native capacity becomes available. When
there is room, pending samples are preserved in order. On sustained backpressure,
only the stale software chunk is replaced; active AudioOut buffers are never
overwritten, and playback is not stopped or restarted. Every Opus packet is still
decoded so dropping PCM does not corrupt decoder state. Long decoded packets are
split into the same bounded chunks. The overlay reports deliberately skipped
audio duration, separate from network FEC failures. This trades stale audio for
bounded buffering when the scheduler or network falls behind.

The overlay and RAM history record observed queue-empty episodes and time until
the next successful append. They exclude prefill and do not restart playback.
These are sampled starvation indicators, not exact DSP underrun durations or
played-sample measurements; a queue can empty between observations.

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

The stream loop presents on animation callbacks, with a 50 ms watchdog when rendering
callbacks stop. While awaiting a callback, GPU modes schedule at most one service
turn after 4 ms: up to 2 ms of cooperative packet/input/audio work, followed by
pending AudioOut delivery. It never publishes video or reschedules itself. Its
requested budget or observed total cost, whichever is larger, is deducted from
the following frame's pump allowance; an overrun can consume that allowance
completely. The display callback remains pending, and frame/stop/error cancels
the service timer. CPU diagnostic renderers keep their original scheduling.
Separate service counters and timings are retained in the overlay/RAM history.
Each display iteration first tries video, then runs two cooperative C
pumps (budgets detailed below). A fence check between them releases completed
video promptly. At 40 Mbps or higher, if the early drain did not submit or publish video, one mid-frame
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
work. Below 40 Mbps this is split 6+6 ms; at 40 Mbps or higher it is split 4+8 ms so a
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
  The default request is 1280×720, 60 fps, 20000 kbit/s. Native stream settings
  allow up to 1920×1080, 60 fps, 80000 kbit/s. Above 720p, the compressed
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
  The combined −/+ state opens the local stream drawer; Logout opens the
  Disconnect/Terminate popup. Drawer and popup input stays
  local and held dismissal buttons must be released before remote input resumes. Native game actions
  remain a partial fallback when full controller state is unavailable. Keyboard keys
  use Moonlight's Win32 key events. C APIs that may take locks run in a cooperative
  task, with bounded queues and coalesced controller state. Touchscreen modes
  supply relative mouse input or Sunshine multi-touch as described below. An
  English virtual keyboard sends the same Win32 key events. Gyro and additional
  controllers are absent.
- Teardown interrupts startup or stops an active core, pumps until tasks finish,
  and then releases decoder/audio objects, sockets and owned memory. If cleanup
  times out, referenced memory is retained and further streams require restarting
  Civ VII. Existing game-owned resources are never freed.

## Touchscreen input

Settings retain `touchMode` as `trackpad` (default for older settings) or `touchpad`.
Trackpad mode sends relative mouse movement, one-finger left taps, two-finger
right taps, two-finger scrolling, and double-tap dragging. A second single-finger
contact within 300 ms and 24 reference pixels presses left immediately; lifting
releases it. Taps must
finish within 250 ms and stay within 12 reference pixels. Movement uses the
stream's pixel dimensions, retaining fractional deltas. Adding a second finger
terminates a drag; the third finger cancels pointer input and opens the keyboard.

Two-finger scrolling uses the centroid of stable contact IDs, starting after
12 reference pixels of movement. It sends high-resolution vertical and horizontal
wheel events with natural direction (the page follows the fingers), at 120 wheel
units per 40 pixels on a 1280×720 reference screen. Fractional deltas accumulate;
finger arrival/lift/replacement rebases the centroid so it cannot jump. A scrolling
gesture never clicks or moves the cursor. Lifting both fingers, cancellation or
focus loss clears its fractional remainder. No inertia is added.

Touchpad mode sends `LiSendTouchEvent` down/move/up events with stable pointer IDs
and coordinates normalized to the fitted video rectangle. Contacts starting in
letterbox bars are ignored until lifted; active contacts clamp at picture edges.
Pressure/contact area are reported as unknown. The core checks Sunshine's
`LI_FF_PEN_TOUCH_EVENTS`; unsupported hosts show a notice without changing modes
or silently substituting mouse events. Sunshine's host OS/app must also support
touch injection. This uses touchscreen events, not gamepad touchpad events.

The Switch source borrows the initialized game HID session and calls the exported
Result-returning `nn::hid::detail::GetTouchScreenState<16>` getter. The 656-byte
SDK state uses a 16-byte header and up to sixteen 40-byte contacts, with owned
guarded storage. The layout follows [libnx HID structures](https://github.com/switchbrew/libnx/blob/master/nx/include/switch/services/hid.h);
the exported symbol is recorded in `investigation/evidence/streaming-input-exports.txt`.
DOM TouchEvents provide the browser fallback; native and DOM samples never mix.
The getter/layout and end-to-end host injection still need console qualification.

All remote pointer calls execute on the cooperative C input task, rather than
calling locking upstream APIs from JS callbacks. A 256-event ring preserves
button/contact transitions, coalescing only adjacent compatible movement and
same-direction wheel deltas within signed 16-bit bounds. Wheel reversals remain
ordered. At most 32 pointer events dispatch in one task turn, with cooperative
deadline checks.
Queue rejection cancels the gesture. Focus loss, touch cancellation, dialog entry
and stream shutdown discard pending presses and release held mouse buttons and
cancel direct contacts. Held fingers require neutral before remote input resumes.
The local dialog's touch controls remain usable.

## Streaming virtual keyboard

The third simultaneous contact opens the English keyboard as soon as it lands
in either touchscreen mode, following Moonlight-Switch's
[three-finger recognizer](https://github.com/XITRIX/Moonlight-Switch/blob/a75fee223914f36ec26b29739d95331307960fa3/app/src/gestures/fingers_gesture_recognizer.cpp).
All opening fingers must lift before keys can be pressed. Touch outside the panel
closes it and consumes that contact until all fingers lift. The keyboard uses the
reference's [full six-row layout](https://github.com/XITRIX/Moonlight-Switch/blob/a75fee223914f36ec26b29739d95331307960fa3/app/src/keyboards/full_layout.cpp):
English QWERTY, function keys, number row, punctuation, left/right modifiers,
Space and arrow keys. No alternate language, compact layout or numpad mode is
included.

Each contact holds its current key until it slides away or lifts. Several keys
can remain down together; simultaneous snapshots press modifiers before ordinary
keys and release ordinary keys before modifiers. Duplicate contacts on a key and
physical keyboard events share ownership, so one owner cannot release another's
held key. Caps Lock is a toggle; touch modifiers are held rather than latched.
Labels reflect local Shift/Caps state; the host's active keyboard layout and
initial Caps state still determine the resulting characters.

Touch opening does not capture gamepad navigation or buttons; they continue to
the streamed app. **−/+ → More → Show keyboard** calls
`stream.openKeyboard("gamepad")` for use without a touchscreen. In that mode the D-pad
navigates every key, A holds ordinary keys and toggles modifier latches for
combinations, and B closes. The opening button must return to neutral first.
Touch-opened keyboards have no controller selection and ignore those commands.

Controller mode also maps Nintendo **Y → Backspace**, **X → Space** and
**L/R → left/right arrow keys**, based on the reference's
[keyboard shortcut actions](https://github.com/XITRIX/Moonlight-Switch/blob/master/app/src/streaming_input_overlay.cpp).
These shortcuts preserve modifier combinations and share ownership with focused,
physical and touch keys. Holding a shortcut targets 100 ms clicks
with a 350 ms initial repeat delay and subsequent 150 ms intervals. Controller
samples advance repeats without replaying a backlog after stalls; releasing or
dismissing cancels active clicks. A queue failure clears shortcut state and waits
for all buttons to return to neutral.

The controller keyboard footer uses a Switch-style bar with D-pad, shoulder and
face-button badges: Move, Left, Right, Backspace, Space, −/+ Menu, B Close and
A Hold key. On a modifier, A changes to Lock modifier / Unlock modifier. The bar
is hidden for touch opening, where those controller actions continue to the host.
It uses regular body fonts and final-size pixels at 720p/1080p, with no new image
assets or runtime dependencies.

Key transitions use the bounded C input queue. A native held-key ledger supports
resetting input without losing releases when the queue is full: reset discards
pending presses and releases keys already dispatched. Focus loss, touch
cancellation, stream options, shutdown and keyboard dismissal clear the relevant
owners. Native calls that may lock remain on the cooperative input task. The
generated runtime includes `ml_session_keys_reset`; it must be rebuilt together
with the adapter. Browser interaction and host-native queue tests do not establish
console touchscreen behavior or host handling of secure key combinations.

## Validation

```sh
npm test
npm run test:ui
npm run test:runtime
```

The browser suite covers card launch, key forwarding, the host-titled Escape/−+
drawer, nested More/Logout navigation, touch and polled-controller keyboard
opening, live touchscreen switching and save errors, Disconnect versus Terminate,
B dismissal, input isolation with stalled animation callbacks, running-app sorting and disabled cards,
top-right termination with cancellation/error handling, and returning to the grid. Protocol tests cover launch/resume, keys, pinned TLS,
permissions, cancellation and host-bound RTSP URLs. The generated-runtime tests
exercise upstream algorithms, cooperative scheduling and PNG pixels/CRCs/bounds.

For a bounded live Desktop test (starts a real session for 20 seconds):

```sh
python3 -B investigation/probes/send-runtime-test.py 192.168.1.182 \
  --probe investigation/probes/probe-live-gpu-texture.js \
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

### High-bitrate recovery work

The streaming target wraps nanors' implementation selection and recovery entry
point without editing its pinned sources. Its three GF byte-vector operations
use synchronous JavaScript typed-array kernels, with the multiplication table
derived from upstream's own reference implementation. C checks its cooperative
deadline every four vector operations. The Reed–Solomon algorithm, packet
assembly and recovery decisions remain upstream.

Read-only FEC statistics report recovery calls, failures, shard bytes, wall time
and the number of runtime budget yields observed during recovery. Wall times
include suspension and may overlap other tasks; they are not exclusive CPU time
or uninterrupted stall durations. Metrics are versioned and range-checked.

Tests compare all 256 coefficients, unaligned pointers, short tails and in-place
scaling against upstream; a 64-data/16-parity fixture verifies parity and recovers
16 erased shards. Another test suspends recovery repeatedly and verifies the
resumed bytes and task cleanup. Diagnostics remain under `investigation/`.

80 Mbps is an experimental stress setting. See the
[80 Mbps investigation](../investigation/evidence/quality-80mbps.md) for measured
limits and the 50/60 Mbps comparisons. The application retains nonblocking
32-packet native receives and the existing 12 ms budget for demanding 60 FPS
streams.


### Rare gameplay stalls

At 40–80 Mbps, the GPU renderer uses direct owned packet batches, packet reuse,
paired FEC tables and negotiated H.264 reference-frame recovery. This avoids
reserving the improved recovery path for the 80 Mbps setting; 40–70 Mbps
retains its previous pump budget. See [Wreckfest evidence](../investigation/evidence/wreckfest-stalls.md).

The UI retains up to ten minutes of one-second stream statistics and controller
update counters in RAM, even with the overlay off. Stop the stream and close the
UI before using `investigation/probes/read-stream-diagnostics.js` through
`send-probe.py`; it exports the history to the sender after streaming. Starting
another stream replaces the history, and restarting Civ VII loses it. This adds
no Switch files and performs no loader TCP logging while streaming.

### Running applications and termination

The library reads authenticated `/serverinfo` together with `/applist` when opened,
refreshed, or restored after a stream. A busy host's `currentgame` appears first
with a Running badge; the remaining cards are dimmed, disabled, and skipped during
controller navigation. Selecting the running card resumes it. **Terminate app**
at the top right opens a Cancel/Terminate confirmation.

While refreshing, an animated progress overlay dims the existing cards and blocks
launches until both the application list and running status arrive. B still
returns to the host list and cancels the request.

Disconnect only stops the local stream client. Terminate waits for stream cleanup,
then uses the paired, pinned HTTPS `/cancel` endpoint. Both termination controls
recheck the running application ID before requesting cancellation and surface
host errors. A successful `/cancel` response is followed by bounded `/serverinfo`
polling for up to 15 seconds, since acknowledgment can precede process cleanup.
The library remains busy until the old application stops, then refreshes its
Running badge and enabled cards. A host that stays busy produces an explicit
error instead of a false success; the kill request is never repeated by polling.
