# Hardware findings — 2026-11-07

The later [Switch OLED comparison](oled-compatibility.md) records why the current
video backend fails there: the loaded movie interface used on Switch 2 was not
present in the inspected OLED process. These Switch 2 findings do not establish
OLED streaming support.

Target: user's Switch 2, Civ VII/CivSwitch loader at 192.168.1.182:9026.
Sunshine: 192.168.1.4:47989, advertised HTTPS port47984.

Streaming investigation: start with [the feasibility ledger](streaming-feasibility.md)
for measured Wasm, video, audio, networking, execution limits and linked probe logs.
The later [wasm2js build and hardware test](wasm2js.md) establishes execution of
the actual C core's algorithms as ordinary JS without enabling WebAssembly.
The [direct-rendering ledger](direct-rendering.md) records the implemented
native texture presenter, generated-image hardware checks, and real host runs
and the later native GPU decoder path at about 30 presented fps at 720p.
[Live session evidence](streaming-live.md) tracks
video/audio results and their remaining limitations.

The [HEVC investigation](hevc.md) identifies all five installed movie decoder
types and records on-console HEVC format rejection. The additional video types
are VP8 and VP9, so the app retains H.264 without adding an unsupported setting.

The [1080p quality investigation](quality-1080p.md) records 1080p60/10 Mbps
decoder/texture validation, larger LAN packets, render/pump experiments, and
full-UI, audio, input and local exit measurements.

The [20 Mbps investigation](quality-20mbps.md) records native batched UDP receive,
near-60 FPS delivery at 1080p60/20 Mbps, and input, healthy/outage exit and 10 Mbps
regression checks. It also preserves the incomplete repeated-start diagnostic.

The [higher-bitrate investigation](quality-high-bitrate.md) compares 25–40 Mbps,
retains 25/30 Mbps presets, and records larger receive batches with heap-backed
message metadata, full-UI measurements, input timing and remaining startup limits.

The [40 Mbps optimization](quality-40mbps.md) records the O3/LTO stream build,
conditional mid-frame decoder checks, 4+8 scheduling and bounded GPU completion
queries, with real UI, input, audio and outage-exit results.

The [80 Mbps follow-up](quality-80mbps-followup.md) preserves failed experiments
and records direct owned packet reception, reference-frame recovery, compiler
specializations, and the later playable full-UI result with its limitations.

- `network-capabilities.txt`: actual JavaScript capability inventory; XHR external
  request returned404. WebSocket exists but external connectivity was not tested.
- `native-network.txt`: direct native TCP GET returnedHTTP200/serverinfo. SDK
  export inspection found native SSL, clientPKI import, nonblocking mode,
  secureRNG, SHA256, and AES functions. Export presence alone is not execution.
- `rng-clock.txt`: bounded runtime probe established that Date advances inside a
  callback and nativeRNG returns varied bytes quickly. No keys/secret bytes logged.

Separate probes successfully created a TLS1.2 context/connection, assigned a
socket/hostname/certificate buffer, and selected nonblocking I/O. Handshake
returned retry0x1987b then error0x19e7b; this did not establish a successful TLS
session. An unauthenticated self-signed host was being tested. The exact failure
reason was not independently decoded.

The SDK TLS wrapper code was read from the running process and inspected to
confirm object size and argument order. REA accepted the synthetic ELF containing
that bounded code slice, but its Hopper assembly provider rejected requests;
a temporary Capstone installation was used for disassembly. No complete game
binary or private state was extracted.

The first live UI reached Sunshine online and then became unresponsive during
identity generation. A later bounded diagnostic showed multi-second Forge RSA
steps with very little time spent obtaining entropy. This motivated accelerating
modular arithmetic and retaining hard per-step/rejection limits.

Pairing and persistence results must be recorded separately after actual PIN,
mutualTLS, write/readback, and reload tests. Protocol unit tests do not establish
these on-device facts.

`identity-bigint.txt`: on-console RSA2048 generation completed in1997ms after
modular arithmetic was moved to BigInt. Certificate signing, PKCS#12 creation,
identity save/commit/readback completed. The diagnostic deliberately stopped at
`waiting_pin` before sending the first `/pair` request. This establishes identity
persistence, not successful Sunshine pairing.

`tls-client-certificate.txt`: a focused native HTTPS diagnostic reloaded the
persisted client identity, imported its PKCS#12, verified the exact host leaf
certificate, and obtained HTTP200 with `PairStatus=1`. For this isolated test,
the public host certificate was read on the Mac and embedded in the diagnostic;
it was not saved as an authenticated pairing pin. Production pairing obtains
and authenticates the pin through the console's PIN challenge exchange. The
initial full-flow TLS failure and later diagnostic success suggest a transient
post-pairing handshake issue; bounded retries retain all verification checks.

`pairing-success.txt`: the complete UI flow succeeded after the next manual PIN
approval. It used the console's PIN-authenticated server certificate, native TLS
with the stored client identity, HTTPS pairchallenge and `PairStatus=1`, then
committed/read back the successful host record. The user also reported
“Paired successfully.” The temporary PIN is omitted from this saved transcript.

A second Connect reloaded the saved pairing and returned
`MOONLIGHT_PAIRING_SAVED: reused`, without entering the PIN stage. This verifies
on-device file persistence and authenticated reuse between connection attempts.
A complete game restart/reboot persistence test has not been performed.

Current storage: all experiment-owned Switch files live in
`save:/moonlight-experiment/`. The identity and paired host were verified by
reloading the saved data and obtaining authenticated native HTTPS `PairStatus=1`.
Native reads/writes reject paths outside this directory. Local cleanup removes
only this directory; it has not been executed on the real identity, which is
intentionally preserved. Filesystem tests cover interrupted writes, recovery,
and cleanup scope.


Application list: the Switch fetched `/applist` over pinned native TLS and parsed
three entries: Desktop (881448767), Steam Big Picture (1093255277), and Virtual
Display (382300562). DOMParser was confirmed absent. Browser UI tests use a
separate ten-entry library to check the portrait grid at 720p and 1080p, four-way
keyboard/engine/gamepad navigation, paging and partial rows, horizontal footer
controls, literal rendering of markup-like titles, empty/error responses, refresh,
B cancellation, late responses, reconnect, and close.
`games-screen-preview.png` depicts the three example host entries using the fake
browser host, generated test PNG covers, and the current dark card style. These
fixture covers are not images downloaded from the real host.
The user then verified the dedicated screen on the real Switch: the list,
portrait grid, four-way D-pad navigation, horizontal footer controls, and B back
all work. Browser tests also cover lazy PNG loading, download/decode failures,
and cancellation. All three real host covers subsequently loaded and fired image
display events on the Switch; the user verified immediate cache reuse.

`image-loader.txt`: a read-only console probe confirms PNG data URLs and image
load events work for visible and hidden elements. The first real host cover was
downloaded through pinned TLS (Desktop, 8231 bytes). The user reported repeated
slow loads, so the cache now survives Refresh and returning to Host for the same
host; browser checks assert that both requests and image elements are reused.

Persistent artwork cache (2026-11-08): closing the UI previously discarded all
cached covers, causing another download on the next load. The app now stores
checked PNG bytes and an index inside `save:/moonlight-experiment/artwork/`,
with a 16 MiB limit. `artwork-persistence-warm.txt` records all three real covers
downloaded and saved (131,742 bytes total). `artwork-persistence-cold.txt` records
fresh modules and a new native transport/store loading all three from disk:
three cache hits, zero `/appasset` requests, no cache errors, and successful
loader completion. Reads took 67, 178, and 684 ms respectively.

`artwork-write-diagnostic.txt` locates an earlier native disconnect at CreateFile
with a 68-character filename. `artwork-write-short-filename.txt` confirms that
60-character filenames allow binary writes, readback, index writes, and commit
to complete successfully. The isolated fixture was subsequently removed
(`artwork-fixture-cleanup.txt`). Cache filenames now use 56 hex characters plus
`.png`; full SHA-256 keys and byte digests remain in the index. Local cache tests
exercise reloads, corrupt/missing PNGs, quota eviction, invalid indexes, and failed
writes. `artwork-persistence-ui-tests.txt` records browser regression results.
The updated streaming UI was then loaded (`artwork-persistence-ui.txt`); its
`MOONLIGHT_ARTWORK_CACHED` events confirm the Games screen uses the disk cache.

Stream settings (2026-11-08): `settings-local-tests.txt` records all 23 local
tests passing, including mode validation, persistence across store instances,
corrupt preferences, and write/commit/readback failures. `settings-ui-tests.txt`
checks controller/keyboard navigation, Host and Games entry points, save errors,
return navigation with cover reuse, and the chosen mode reaching the stream
client. `settings-screen-preview.png` shows the separate screen at 1280×720.
`settings-persistence-switch.txt` verifies native write/commit/reload of
960×540, 60 FPS, 8000 kbit/s using a new native transport, then restores the prior
720p/30 FPS/5000 kbit/s mode. Only the experiment's `settings.json` was written.

Direct packet I/O and telemetry (2026-11-08): `performance-direct-io-switch.txt`
passes native TCP/UDP and cooperative scheduling with all received/sent payload
bytes going directly through the core heap. `performance-live-switch.txt` runs
a bounded 720p60 Desktop stream and records 741 decoded/presented frames with
741 matching decode timestamps, 3,659,719 bytes received directly, no reported
video frame gaps/decoder rejects/local audio drops, and successful teardown.
Steady interval rates were about 60 texture submissions/sec; decode-ready delay
was roughly 10–13 ms and copy/presentation roughly 0.7–1.2 ms. These values do
not include physical display scanout and are not a controlled before/after CPU
benchmark. The timing data also shows substantial submission interval jitter.

`performance-setting-switch.txt` verifies persistence of `showStats: true` and
restores the user's previous mode/overlay preference. `performance-local-tests.txt`
records 28 passing tests, including direct buffers, heap replacement, bounds,
runtime factory replacement, telemetry calculations and settings. The rebuilt
upstream core/runtime checks are in `performance-core-tests.txt` and
`performance-runtime-tests.txt`; build output is `performance-runtime-build.txt`.
`performance-ui-tests.txt` verifies overlay On/Off, saved preferences, removal on
stop, and existing game/input behavior. `performance-overlay-preview.png` uses
synthetic metrics for browser layout checks; hardware values are in the live log.

Newest-frame presentation and bounded audio (2026-11-08):
`low-latency-live-switch.txt` records a 20-second 720p60 test with one deliberate
80 ms JavaScript stall. It decoded 1,088 frames and submitted 721 texture updates;
the last complete sample counted 352 superseded decoded outputs. All compressed
reference inputs were still fed to the decoder. The lower texture-update count
reflects copying only the newest ready output per drain, rather than copying
several outputs into the same texture before yielding.

That run used three 10 ms native buffers and one replaceable
10 ms waiting chunk, with less than 10 ms of partial staging. Observed audio
buffering stayed at or below 40 ms in this run. Under pressure it skipped stale
software PCM; the last sample counted 42 skips (420 ms), including recovery from
the intentional stall. AudioOut was not restarted to catch up. Video frame gaps,
native decoder rejects, and audio FEC failures remained zero; cleanup returned
to the loader successfully. This is a queue/ownership test, not an input-latency
measurement. The user had audio muted, so perceptual audio quality was not checked.

Earlier tuning results are retained in `low-latency-restart-attempt*.txt`,
`low-latency-20ms-attempt*.txt`, and `low-latency-continuity-attempt*.txt`.
They motivated continuous playback, an extra 10 ms of jitter headroom, and
preserving waiting samples whenever reclaimed capacity is available. None of
the earlier output-reset policies remain in app code.

`low-latency-local-tests.txt` records all 33 tests passing. Queue tests verify
newest timestamp selection, release on errors, bounded drain work, native PCM
ownership, continuity when capacity returns, long Opus packets, and sustained
backpressure. `low-latency-ui-tests.txt` checks overlay settings and existing
stream/navigation controls. Local skip counts and skipped audio duration are
shown separately from network loss indicators in the overlay.

Lag diagnosis (2026-11-08): the user's subsequent 720p30/3 Mbps run is summarized
in `lag-stream-summary.json`, reconstructed from chunked reports in
`low-latency-ui-switch.txt`. Median decoded rate was 30.13 FPS versus 20.61 texture
submissions/sec. The final active sample had 595 superseded outputs among 1,871
decoded frames, and 16.13 seconds of locally discarded PCM among about 62.35
seconds decoded (25.9%). No video frame gaps, native decoder rejections, or audio
FEC failures were reported. Median host processing was 2.01 ms, decode-ready
17.53 ms, copy/presentation 1.02 ms, and measured ENet RTT 41 ms. Cooperative
pumps averaged 9.50 ms per iteration and peaked at 320 ms. These timings identify
a client scheduling/buffering problem as well as possible network jitter.

The user confirmed Ethernet on the Sunshine PC and Wi-Fi on the Switch.
`lag-native-tcp-switch.txt` measures actual Switch-to-PC TCP handshakes using
native poll, avoiding JS timer wakeups: all 20 succeeded, median 10.60 ms,
range 2.07–25.52 ms, p95 24.30 ms. This was measured with streaming stopped and
does not prove the under-load latency during the earlier stream. The idle timer
probe (`lag-idle-host-switch.txt`) found a requested 2 ms timer waking at a median
16.65 ms. Its HTTP timings include the adapter's 20 ms polling sleeps, so they
must not be presented as raw network RTT.

Independent Mac probes also saw LAN jitter: `lag-ping-switch.txt` reports 30/30
responses with 40.11 ms average and 145.46 ms maximum; `lag-ping-router.txt` has
30/30 responses averaging 18.42 ms, maximum 91.97 ms. `lag-host-tcp-mac.txt` has
30/30 successful PC TCP connects with median 5.45 ms and maximum 94.13 ms. The
PC did not reply to ICMP (`lag-ping-host.txt`), despite successful TCP/HTTP, so
that ICMP result is not evidence of 100% network packet loss. Mac-based timings
include the Mac's own LAN path and cannot locate a specific radio problem.
No application settings or Sunshine session state were changed by these probes.


Frame scheduling and audio retuning (2026-11-08):
`scheduling-stream-summary.json` summarizes the final full-UI run in
`scheduling-ui-final-live-switch.txt`, at the saved 720p30/3 Mbps settings with
native controller polling and the overlay enabled. Five active interval samples
had median 29.55 decoded and texture FPS (texture range 27.53–29.99), versus
20.61 median texture FPS in the earlier laggy session. The loop ran at a median
58.99 Hz; average pump cost was 6.79 ms and drain cost 0.86 ms. Median decode-ready
time was 11.16 ms; copy/presentation was 0.92 ms. Final totals were 727 decoded
frames and 702 texture submissions. Of 24.265 seconds of decoded PCM, 80 ms was
intentionally skipped (0.33%, versus 25.9% previously). Sampled audio buffering
never exceeded 70 ms. No sampled video gaps, decoder rejections, or audio FEC
failures were reported. Stop returned state 0/tasks 0, with one forced clock wake.

These are different sessions, not a controlled Wi-Fi comparison. ENet RTT was
also lower (median 13 ms, sampled 9–29 ms), so the full improvement cannot be
attributed solely to code changes. Texture submissions are not display scanout,
and the user requested measurements only; perceptual audio quality was not checked.

The app now wakes on animation callbacks, with a 50 ms watchdog for suspended
rendering callbacks and an immediate stop wake. The cooperative runtime checks an
8 ms deadline in socket loops and media callbacks. Individual native/codec calls
can still exceed this budget. The audio queue uses two 20 ms native buffers and
one replaceable 20 ms software chunk, plus a partial chunk under 20 ms. Native
buffer ownership and continuous playback remain unchanged. Compact console reports
run every five seconds, while the overlay remains at one second. The preceding
full-UI test (`scheduling-ui-8ms-live-switch.txt`) exposed extra audio skips from
large chunked console snapshots; the final compact reports avoid those bursts.

`scheduling-live-switch.txt` records the rejected 4 ms budget experiment. It kept
local PCM skips at zero but starved packet handling and accumulated audio FEC
failures; its generic direct-I/O/cleanup checks passed, not its performance goal.
`scheduling-8ms-live-switch.txt` records the successful 8 ms bounded test before
full-UI integration. `scheduling-wakeups-switch.txt` compares short timers and
frame callbacks with 3 ms of work. Both had approximately 16.7 ms median wakeup
intervals; frame callbacks were more consistent in this small workload. This does
not establish that changing only the wakeup mechanism improves throughput.
`scheduling-ui-live-switch.txt` is an invalid initial harness run (no stream).
The corrected harness explicitly awaits the UI lifetime and dispatches DOM events.

`scheduling-local-tests.txt` records 34 passing tests, including frame watchdog/
stop cancellation, PCM backpressure/ownership, and loop telemetry. The rebuilt
core checkpoint test passes in `scheduling-runtime-tests.txt`; build output is
`scheduling-runtime-build.txt`. `scheduling-python-tests.txt` records two passing
transport tests. `scheduling-ui-tests.txt` covers settings, overlay toggles,
controller navigation and cleanup. `scheduling-final-ui-switch.txt` records loading
the final normal UI. All new Switch experiment writes remain under
`save:/moonlight-experiment/`; probes and evidence are kept on the Mac.


Input latency investigation and priority scheduling (2026-11-08):
`input-latency-summary.json` and its compact `.txt` counterpart compare seven
completed 24-second streaming runs. The test sends neutral controller state,
observes ENet channel 16 reliable sequences at the native socket boundary, and
correlates host ACKs. It does not press host buttons or install host software.
All probes use RAM only on the Switch. The user's saved stream preferences were
preserved, and `input-final-ui-switch.txt` records the updated normal UI ready.

At 720p30/3 Mbps, `input-baseline-valid-switch.txt` recorded 80/80 updates sent and
acknowledged. Median sample-to-socket delay was 19.945 ms, p95 22.261 ms. Native
controller polling itself took a median 0.291 ms at approximately 60 Hz. Giving
our controller-dispatch task priority 2 and upstream's `InputSend` task priority 1
reduced the corresponding median to 1.762 ms, p95 2.051 ms, in
`input-priority-switch.txt` with the same 8 ms budget and sparse input cadence.
Each priority task gets one turn before the regular round-robin pass; upstream
sources, packet formats, encryption and reliable delivery remain unmodified.

Continuous neutral input, once per animation callback, exposed insufficient
processing headroom with that 8 ms budget. At 720p30 it still delivered all 1,200
updates with 1.713 ms median local delay, but skipped 900 ms of decoded PCM
(4.154%). At 720p60, it coalesced 80 of 1,200 updates and delivered a median 38.005
texture updates/sec. One-to-one input timing is deliberately suppressed for that
run, because pairing a coalesced packet with the oldest pending sample would
produce fictitious queue delays. See `input-priority-continuous-30fps-switch.txt`
and `input-priority-continuous-switch.txt`.

The final shared budget is 10 ms. `input-priority-10ms-30fps-switch.txt` sent and
acknowledged all 1,200 updates with 1.710 ms median sample-to-socket delay (p95
6.568 ms). Median texture rate was 29.962 FPS; 60 ms of decoded PCM was skipped
(0.275%). `input-priority-10ms-60fps-switch.txt` also delivered all 1,200 updates,
with median 1.715 ms local delay (p95 7.639 ms), 51.599 texture updates/sec and
20 ms skipped PCM (0.094%). Both returned state 0/tasks 0. No video frame gaps,
decoder rejections or failed audio recovery blocks were sampled in either run.
The earlier sparse-input 60 FPS run (`input-priority-60fps-switch.txt`) delivered
50.326 median texture updates/sec even before the final budget change.

Baseline socket-to-ACK time had median 13.226 ms, p95 19.923 ms and max 35.104 ms.
Final continuous runs had medians 4.292/4.467 ms, p95 below 18 ms and max around
67 ms. These values include receive polling, not only Wi-Fi airtime. Retransmits
were observed; they are not a Wi-Fi packet-loss measurement because the client's
service cadence can also delay ACK processing. The repeated local queue delay
is demonstrably improvable. These tests do not measure physical button age,
Bluetooth latency, host game response, capture-to-display delay or display scanout,
and cannot rule out network trouble during a different gaming session. A 30 FPS
capture spaces images about 33 ms apart; the 60 FPS option reduces that spacing
but did not achieve 60 texture updates/sec under this workload.

`input-priority-build.txt` records the rebuilt core. The runtime test in
`input-priority-runtime-tests.txt` verifies dispatch/sender ordering ahead of a
busy normal task, deadline yielding, joins and cleanup. `input-priority-local-tests.txt`
records 34 passing app tests. `input-observer-tests.txt` checks ENet parser bounds,
failed sends, reliable sequences, retransmissions, socket identity and first-ACK
correlation. Large experiment logs are bounded and decoded by the existing probe
transport. The new run helper includes all protocol dependencies and explicitly
awaits the probe lifetime:

```sh
python3 -B investigation/probes/run-input-timing.py 192.168.1.182 --fps 30 --output investigation/evidence/input-recheck.txt
python3 -B investigation/probes/run-input-timing.py 192.168.1.182 --fps 60 --continuous --skip-upload --output investigation/evidence/input-stress-recheck.txt
python3 -B investigation/probes/summarize-input-timing.py
```

The initial attempt was blocked by the Mac's VPN route and refused direct LAN
connections (`input-connectivity-block.txt`). After the laptop reboot, a raw
large-payload attempt ended without execution output (`input-baseline-switch.txt`),
and a subsequent bounded attempt lacked the in-memory streaming core
(`input-baseline-run-switch.txt`). Neither contains valid timing data. Reloading
the core (`input-upload-retry-switch.txt`) and using the complete bounded probe
produced the valid baseline. No system network/VPN settings were changed.


Local exit during network/render stalls (2026-11-08):
The user reported a frozen stream that ignored −/+ for roughly 30 seconds.
`input-final-ui-switch.txt` from that session shows ENet RTT rising through
110 ms, 1,144 ms and 2,000 ms, then no texture updates and eventual host timeout.
It does not show a prompt user-requested stop. Rendering callbacks were the only
route polling the chord. Stream reports also called the loader's TCP logger
synchronously; a stalled Wi-Fi path can block that native logger. The old stop
path left reliable input draining/ENet linger and sleeping workers to unwind.

The stream screen now checks local exit on a separate nominal 50 ms timer, even
when remote input is suspended. Stop wakes the stream loop, immediately interrupts
the core and prioritizes teardown. Neutral gamepad state and queued key-up events
get a fixed grace of at most 100 ms. After its deadline, connect/send/receive/poll
fail locally without calling the native socket API; repeated stop cannot extend
the deadline. Close/shutdown and owned memory remain available until C tasks end.
Interrupted sleeping workers wake immediately. Teardown uses short timers rather
than animation callbacks. Existing unfinished-task quarantine is retained.

Stream logs and the latest statistics stay in RAM. After a stream starts, other
UI messages also stay local for the rest of that UI session, avoiding late artwork
or Games/Host logging calls on the same stalled TCP connection. The bounded
`window.__moonlightStreamDiagnostics` ring has 64 entries of at most 512 characters;
there is no automatic network flush on exit, and no new Switch files. Read it
with `read-stream-diagnostics.js` after closing the UI and restoring connectivity.
The performance overlay still updates during playback.

`exit-cancel-summary.json` records the final full-UI hardware checks. The test
blackholes only core stream send/receive/poll operations, suppresses animation
callbacks and injects −/+ through the Npad adapter. No system Wi-Fi/router settings
are changed. In `exit-cancel-outage-fast-switch.txt`, the timer recognized the
chord in 79.382 ms and Games returned in 234.596 ms. In the healthy companion run
(`exit-cancel-healthy-fast-switch.txt`), detection took 33.663 ms, return took
148.493 ms, and the host acknowledged graceful disconnect. Both returned state 0,
tasks 0 and no live TCP stream logs. `exit-cancel-loaded-ui-switch.txt` records the
final normal UI ready. These are injected-fault measurements, not a guarantee
that JavaScript can preempt a blocking native driver or OS pause.

Earlier steps remain as evidence: `exit-cancel-switch.txt` is the initial immediate
cancellation test (121.522 ms to Games). `exit-cancel-final-switch.txt` tests the
bounded grace before teardown pacing was fixed (261.028 ms). The first healthy
check (`exit-cancel-healthy-switch.txt`) returned quickly but did not acknowledge
disconnect: 50 ms animation-watchdog waits between shutdown stages exhausted the
grace. `exit-cancel-healthy-diagnostics.txt` identified that step. Replacing those
cleanup waits with short timers produced the final successful healthy/outage runs.

`exit-cancel-local-tests.txt` records 37 passing tests, including cancellation,
non-extended grace, immediate wake and deferred freeing of C-owned buffers.
`exit-cancel-runtime-tests.txt` also verifies that a 60-second sleeping C worker
interrupts and joins promptly. The rebuilt core is recorded in
`exit-cancel-build.txt`. `exit-cancel-ui-tests.txt` checks exit with RAF suppressed
and remote input suspended, bounded RAM logs with a throwing network logger,
existing controls and overlay behavior. Reproduce the hardware checks with:

```sh
python3 -B investigation/probes/run-outage-exit.py 192.168.1.182 --output investigation/evidence/exit-outage-recheck.txt
python3 -B investigation/probes/run-outage-exit.py 192.168.1.182 --healthy --skip-upload --output investigation/evidence/exit-healthy-recheck.txt
```

60 FPS presentation timing (2026-11-08):
`pacing-summary.json` compares 720p60/3 Mbps runs with neutral controller updates
on every animation tick. The renderer checked decoded output only after the
10 ms packet pump. This alternated between empty checks and batches of two or
more outputs, where the newest-only policy intentionally discarded older frames.
The baseline acquired 1,318 outputs but published only 1,103; 215 were superseded.
Moving the check before the packet pump acquired the same 1,318 outputs and
published 1,267, with only 51 superseded. No extra decoded-frame queue was added.
Each tick still publishes at most one texture update and releases all outputs.

For the fixed telemetry selection (omit the first two connected samples), mean
texture FPS rose from 49.14 to 57.77. The 95th-percentile texture update interval
fell from 34.005 to 18.107 ms. These are sequential LAN runs, not packet replays;
network and host timing can vary. Checking again after the pump did not improve
consistency (57.54 FPS, interval p95 24.635 ms). A 2+8 ms split pump also failed to
improve delivery (49.63 FPS), with more variable network/host conditions and nine
frame gaps in that run. Neither alternative is in the app.

The app now checks video early, pumps with the existing 10 ms budget, then drains
pending audio. Timing counters account for both media phases separately from the
core pump. `pacing-input-60-switch.txt` verifies all 80 sampled neutral updates
were sent and acknowledged: median sample-to-socket 4.578 ms, p95 5.331 ms;
median sample-to-host-ACK 11.407 ms. This includes a few milliseconds of early
GPU/driver waiting before the prioritized input sender. It does not measure
physical input-to-display latency.

The complete UI with the overlay enabled was measured at 720p60/3 Mbps in
`pacing-final-ui-60-stats.txt`. Its fixed steady selection averaged 51.92 texture
FPS (median 53.50); most intervals delivered 49–58, with one interval at 17.946
decoded/presented FPS. That interval's cause is unconfirmed. The isolated 57.77
FPS result should not be presented as guaranteed full-UI performance or physical
scanout. After the measurement, the same full-UI test blackholed stream sockets,
suppressed RAF, and injected −/+: detection took 17.033 ms, return to Games
196.743 ms, with state/tasks both zero and no live TCP stream logs.

The full-UI report initially closed before its asynchronous long log finished;
the first RAM read consequently interleaved with that unfinished report. The
clean second read, `pacing-final-ui-60-stats.txt`, contains the same retained test
result and all samples. The test helper now awaits reporting before closing.
Two earlier repeated-probe attempts disconnected without completing and required
reopening CivSwitch (`pacing-split-switch-sender.txt` and
`pacing-final-60-switch-sender.txt`); their exact failure stage/cause is unresolved,
and neither is counted as a passing measurement. `pacing-local-tests.txt` records
39 passing tests, including presentation ordering, separate pump/drain accounting
and cleanup after an early video error. `pacing-loaded-ui-switch.txt` records the
normal updated UI ready. Probes use Switch RAM only and do not change saved
stream preferences. Reproduce the isolated comparison with:

```sh
python3 -B investigation/probes/run-frame-pacing.py 192.168.1.182 --phase baseline --continuous --output investigation/evidence/pacing-baseline-recheck.txt
python3 -B investigation/probes/run-frame-pacing.py 192.168.1.182 --phase current --continuous --skip-upload --output investigation/evidence/pacing-current-recheck.txt
```

GPU overlap and bounded Smooth pacing (2026-11-08):
`gpu-overlap-summary.json` records the next optimization. A fresh full-UI timing
breakdown (`gpu-wait-baseline-ui-switch.txt`) found 3.258 ms average native GPU
transfer time versus 0.164 ms publication time. The existing decoder's NVN sync
path was inspected with bounded read-only captures and REA, then tested while
still waiting synchronously (`gpu-fence-wait-switch.txt`): 973 copies queued in
251.221 ms and waited 2333.551 ms, all completed without fallback. The native
sync evidence and ABI limits are documented in `direct-rendering.md`.

The app now queues the copy early, pumps the core for 4 ms, polls the fence with
zero timeout, pumps for another 6 ms and polls again. A decoder output stays
owned until its GPU copy completes. Only one copy can be outstanding and only
one texture publication occurs per tick. Unknown GPU failures or an unfinished
transfer at close quarantine media/IO/core ownership instead of freeing memory
possibly still in use. Asynchronous transfer alone and shifted checks still
coalesced too many outputs (`gpu-overlap-pacing-switch.txt`,
`gpu-overlap-split3-switch.txt`, `gpu-overlap-finish4-switch.txt`). Smooth pacing
at 60 FPS therefore retains one spare decoded frame, primes for at most one
frame period, and discards stale/excess/backward-timestamp outputs. Low latency
remains selectable in Settings and uses newest-only selection. Pacing is inactive
at 15/30 FPS; GPU overlap is used in both modes. No additional Switch files are
created; the preference uses the existing experiment settings file.

For connected telemetry samples after the first two, isolated Smooth delivery
averaged 59.519 texture FPS with p95 update gap 17.238 ms
(`gpu-overlap-paced-switch.txt`). The complete UI with overlay enabled averaged
57.067 FPS versus 49.444 before, with approximately 60 decoded FPS in both runs.
Full-UI GPU submission averaged 0.231 ms and publication 0.095 ms. Measured
decoder-submission-to-texture-publication age was 28.660 ms, including pacing;
this is not input-to-display or host-to-display latency. Smooth adds up to one
frame of buffering. These are sequential LAN runs, not replayed packet traces,
and texture counters do not establish physical display scanout.

`gpu-overlap-input-switch.txt` verified all 1,200 continuous neutral controller
updates were sent and acknowledged. Median local send delay was 2.278 ms,
p95 7.949 ms; median sample-to-ACK was 7.813 ms. The full-UI 60 FPS outage test
returned to Games in 186.968 ms with state/tasks zero. A repeated-run 30 FPS
test subsequently disconnected after UI ready; the user confirmed Civ VII
closed (`gpu-overlap-30-healthy-switch-sender.txt`). Its exact cause remains
unresolved. The same check passed from a restarted process in
`gpu-overlap-30-fresh-switch.txt`, with host-acknowledged disconnect and return
in 129.546 ms. Most ordinary intervals decoded/presented 29–30 FPS; two source/
decode dips lowered both together. There was no active spare-frame buffer at
30 FPS, and presented/decoded means were 28.117/28.217 respectively.

`gpu-overlap-local-tests.txt` records 46 passing checks, covering retained GPU
ownership, completion/error/stop paths, pacing burst/empty ticks, bounded age and
backlog, settings persistence, Low latency forwarding, and timing counters.
`gpu-overlap-ui-tests.txt` covers the new settings row, help text, navigation and
existing flows. `settings-screen-preview.png` and `performance-overlay-preview.png`
were refreshed. `gpu-overlap-loaded-ui-switch.txt` records the normal updated UI
ready after the fresh-process validation. Native analysis sessions were closed.

[Wreckfest stalls](wreckfest-stalls.md): saved gameplay diagnostics, input-load comparison, and recovery improvements at 40–70 Mbps.
