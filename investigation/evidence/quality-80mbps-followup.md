# 80 Mbps follow-up — 2026-11-08

Target: 1920×1080 H.264, 60 FPS, 80,000 kbit/s requested, on the user's
Switch 2/Civ VII/CivSwitch. PC Ethernet, Switch Wi-Fi. This follows
[the original 80 Mbps investigation](quality-80mbps.md).

## Result and limits

The retained candidate's [one-minute full-UI run](quality80-direct-rfi-full-ui-switch.txt)
averaged **58.70 decoded / 57.60 texture FPS** after the first two samples.
The user watched this run and reported **“Mostly smooth, picture clean.”**
The 21 samples receiving at least 65 Mbps averaged **56.99 texture FPS and
71.47 Mbps RX**. None of the 58 post-warm-up samples was below 30 FPS; the
minimum was 32.94 FPS. There were 96 frame gaps, no decoder rejects, no audio
FEC failures, and 60 ms of deliberate PCM catch-up drops.

This is a playable improvement, not proof of flawless 60 FPS or of sustained
80 Mbps encoded video. The entire run averaged 56.43 Mbps RX because scene
bitrate varied. RX includes parity/audio/protocol traffic. Upstream SDP reserves
bandwidth for FEC and also sends Sunshine the configured 80,000 kbit/s cap;
these are the upstream semantics, not a hidden reduction of our setting.
Texture FPS measures publications into Gameface, not physical display scanout.
The listening experience and input-to-photon latency were not measured here.

## Retained implementation

- **Direct owned packet batches at 80 Mbps.** The native SDK receives up to 32
  packets directly into buffers allocated by the C core. C hands each buffer
  to upstream's existing queue; the batch retains and frees only undelivered
  buffers. This removes a JS socket handoff and scratch-to-packet copy for each
  video packet. The full-UI run received 303,498 video packets through this
  path. Metadata is rebuilt after heap growth. Unsupported native batching and
  encrypted video retain the original receive path. Native waits remain
  nonblocking; no large prefetch queue is added.
- **Reference-frame recovery at 80 Mbps.** Advertise H.264 RFI support through
  Moonlight's existing decoder capability negotiation. The native decoder gets
  the original, unpatched SPS/PPS and bitstream. Both host and decoder must
  negotiate support; the full-UI snapshot confirms it. Lost frames can recover
  without repeatedly waiting for a large IDR. The user's clean-picture report
  is the visual check; this does not establish support for other native decoders.
- **Header alignment.** Video buffers come from malloc/the aligned packet pool.
  Check their alignment before providing that fact to the compiler. This removes
  14 alignment-lowered i32 read sites and associated byte-wise header work.
  Other unaligned reads retain checked DataView specialization, including the
  original partial/out-of-range semantics and a fresh view after heap growth.
- **Exact RTP arithmetic.** Three checked compiler-output sites replace emulated
  i64 timestamp arithmetic with exact bounded JS-number arithmetic. General i64
  operations, including crypto, remain unchanged. The actual compiled diagnostic
  checks 20,009 timestamps against a BigInt oracle.
- **Packet reuse at 80 Mbps.** A 1,024-entry packet-sized pool retains upstream
  malloc/free ownership and allocator fallback. It refuses configuration with
  live tasks/buffers. The full-UI run peaked at 127 live entries, with no misses;
  final in-use count was zero.
- **Faster queue and GF operations.** A checked build-copy queue patch avoids a
  duplicate scan for a packet beyond the highest received sequence after a hole;
  reordered, duplicate and recovered packets keep upstream handling. GF kernels
  use word operations; at 80 Mbps, optional 32 MiB paired lookup tables accelerate
  multiplication. They are prepared cooperatively before launch and released
  only after tasks finish. Upstream Reed–Solomon recovery remains complete.
- **Scheduling.** Input remains first; audio receives a turn before busy video.
  80 Mbps/60 FPS uses a 4 + 9.5 ms pump split. Lower modes retain their existing
  budgets and do not enable the pool, paired tables, direct video batches or RFI.

The pinned upstream checkouts are untouched. `video_queue.py` and
`video_receive.py` generate narrowly adapted build copies and reject changed
source hashes. Compiler postpasses reject unexpected shapes/counts.
No Wasm, Worker, native code injection, companion process or new decoder ABI
is required. Switch probes/uploads use RAM. Persistent app data remains inside
`save:/moonlight-experiment/`.

## What the comparisons actually show

These were sequential LAN runs, not a replay of identical packet captures.
Scene, host pacing and Wi-Fi conditions can differ. Means omit two initial
samples; instrumentation differs where indicated. They establish useful
directions and reject failures, not isolated causal FPS gains for every patch.

| Trial | Decoded FPS | Texture FPS | RX Mbps | PCM discarded |
| --- | ---: | ---: | ---: | ---: |
| [Committed runtime, 80 Mbps](quality80-controlled-head-switch.txt) | 0.20 | 0.20 | 25.28 | 1680 ms |
| [Earlier optimization stack, with I/O profiling](quality80-controlled-current-switch.txt) | 9.84 | 9.15 | 43.19 | 0 ms |
| [Direct owned receive](quality80-direct-live-switch.txt) | 20.98 | 19.94 | 54.70 | 0 ms |
| [Direct receive + RFI](quality80-rfi-live-switch.txt) | 50.78 | 48.31 | 70.30 | 20 ms |
| [RFI + bounded P-frame FEC, rejected](quality80-rfi-bounded-switch.txt) | 27.26 | 26.19 | 60.24 | 80 ms |
| [RFI + 12 ms pump, rejected](quality80-rfi-pump12-switch.txt) | 10.48 | 10.15 | 34.31 | 140 ms |
| [Retained candidate, full UI](quality80-direct-rfi-full-ui-switch.txt) | 58.70 | 57.60 | 56.43 | 60 ms |
| [Candidate, continuous input stress (fallback receive)](quality80-direct-rfi-input-switch.txt) | 58.03 | 54.96 | 67.14 | 0 ms |

The committed runtime artifact was checked against its recorded SHA-256:
`3dc029f5350c26090af6c43f72e961ca484393bc23d1ea683be0a303ef870baf`.
Its terrible result at the same requested bitrate supported retaining useful
new work rather than rolling everything back. The comparison used the current
probe/client shell with a forced 12 ms pump; optional new exports were absent.

Fixed-work on-device evidence is less sensitive to scene changes:

- [RTP conversion](quality80-next-rtp-math-benchmark-switch.txt): about 206 → 18 ms
  for 10,000 conversions.
- [Packet allocator](quality80-next-pool-benchmark-switch.txt): about 28 → 15–16 ms
  for 4,096 allocations.
- [Queue after a hole](quality80-queue-benchmark-switch.txt): about 234 → 38 ms
  for the same 8,192 packets/checksum. This is the tested gap case, not every queue.
- [Paired GF table](quality80-fec-pairs-switch.txt): about 207 → 140 ms for the
  fixed vector workload, with equivalence checks.
- [Raw receive window](quality80-raw-receive-switch.txt): 50,167 packets / 70.70 Mbps
  over eight seconds, with no observed sequence gaps/reordering while deliberately
  skipping C video processing. This demonstrates capacity for that load, not a
  general absence of Wi-Fi loss. Its FPS must not be compared as normal playback.

## Rejected work kept as investigation

The prior prefetch experiment filled its 4,096-packet ring and held packets for
up to 1.75 seconds; [delivery fell to about 1.7 FPS](quality80-prefetch-live-switch.txt).
The [15 ms pump](quality80-pump15-live-switch.txt) also collapsed. Neither is
enabled in the app. The 64-packet SDK path and video-age dropping are likewise
archived probes, not production paths.

FEC work limits were tested both before RFI and with RFI restricted to proven
ordinary P-frames. The latter skipped 140 recovery attempts but delivered worse
overall video. Both variants and fixtures are under `investigation/probes/`;
the production core contains no work-limit policy or export. All recoverable
frames retain full upstream recovery. No migration code was added.

## Input, exit and regression checks

The full UI's fault test blackholed both ordinary socket I/O and direct video
batches, then suppressed animation callbacks. Local −/+ was detected in
**17.17 ms** and returned to Games in **208.70 ms**, with zero live tasks,
zero loader TCP stream logs and zero outstanding pool buffers.

The original input diagnostic omitted the adapter options when wrapping I/O,
so it exercised the fallback receive path with RFI/pool/paired tables active,
not direct video batches. This diagnostic wrapper was corrected and its result
now includes network counters to verify the path. On the earlier fallback run,
continuous input queued 1,200 neutral samples, with 1,199 observed sends and
1,199 ACKs. One coalesced/pending sample makes FIFO sample-to-send attribution
invalid, so those latency fields correctly report null. Transport ACK latency
remains valid: **5.97 ms median / 22.85 ms p95** after send. This is not
input-to-photon latency.

The first 60 Mbps regression attempt disconnected at `preparing`, before pad
initialization or any stream. A small [loader-presence check](quality80-retained-loader-check-switch.txt)
then completed and showed a cleared JS factory with no unfinished stream or
texture owner. This remains an intermittent startup limitation, not a valid
60 Mbps performance measurement. The runtime was re-uploaded for the retry.

The [first completed 60 Mbps retry](quality80-retained-60-retry-switch.txt)
averaged 39.93 texture FPS with 600 frame gaps and 2.02 seconds in FEC recovery.
The [committed-runtime control](quality80-head-60-control-switch.txt) then reached
56.88 FPS with 50 gaps. Repeating the retained candidate at the same setting
reached **58.66 texture / 59.60 decoded FPS**, 54.64 Mbps RX, 28 gaps and **zero
PCM drops, decoder rejects or audio FEC failures**
([repeat evidence](quality80-retained-60-repeat-switch.txt)). Thus the slowdown
was not reproducible as a candidate regression; these sequential runs still
cannot isolate Wi-Fi loss from host/scene variation.

Local validation includes 63 app tests, checked compiler transformations,
the actual wasm2js core with WebAssembly/Worker disabled, and deterministic C
batch-ownership tests across suspension, partial consumption, error and fallback.
Native-adapter fixtures check no-copy receipt, cross-4-GiB pointer carry, heap
growth, invalid bounds and cancellation before native calls.


The browser UI regression suite also passed, including settings forwarding,
controller navigation, artwork caching, overlay cleanup and close. It required
running Chrome outside the filesystem sandbox to expose its local test port.
The retained generated streaming artifact is 1,115,251 bytes, SHA-256
`290b67b1911f9f4acb3a934d1d0eaa41f1207b2a5565f476929fb4d8d181ca6e`.


Before correcting the diagnostic wrapper, the
[discrete fallback-path input test](quality80-retained-input-timing-switch.txt)
matched all 80 samples/sends/ACKs: median 2.37 ms sample-to-send, 6.58 ms
send-to-ACK, and 8.84 ms sample-to-ACK. It averaged 58.69 texture FPS, 59.75 Mbps
RX and zero PCM drops. These are transport timings, not input-to-photon latency.


The corrected direct-path input probe subsequently disconnected immediately
after `Executing payload...`, without a stream result
([failed attempt](quality80-retained-direct-input-switch.txt)). The user confirmed
that Civ VII crashed and restarted it. Its timings are unknown; do not substitute
the fallback-path input measurements as validation of direct-path timing. The
successful full-UI test did use direct reception, including during the simulated
outage. Repeated-start stability remains unresolved. No production source was
changed after the user's “Mostly smooth, picture clean” test; the later source
change only corrected the input diagnostic and exposed its path counters.


After the user restarted Civ VII, the retained runtime was uploaded and the
normal UI reported `MOONLIGHT_UI_READY`. Saved mode is 1920×1080, 60 FPS,
80,000 kbit/s, Smooth pacing, overlay off
([load confirmation](quality80-followup-loaded-ui-switch.txt)). The sender is
left connected for normal use. Settings remain under the existing
`save:/moonlight-experiment/` root. No new post-restart stream measurement is
claimed by this load confirmation.
