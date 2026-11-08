# 1080p60 / 80 Mbps stress investigation — 2026-11-08

Scope: the user's Switch 2, Civ VII 1.0.0, CivSwitch, H.264 native GPU decoder,
Sunshine `192.168.1.4:47989`. PC is on Ethernet; Switch is on Wi-Fi. The user
confirmed steady moving content. 80 Mbps is a stress target, not a promised
playback rate. All persistent Switch writes remain within
`save:/moonlight-experiment/`; probes, uploads and diagnostics use RAM only.

## Retained work

- Add 50, 60 and 80 Mbps settings and extend launch/probe validation to 80,000
  kbit/s. Saved settings retain the existing schema and directory.
- Keep upstream Moonlight, ENet, nanors and crypto sources pinned and unchanged.
  A small app-owned linker adapter substitutes nanors' three GF vector kernels
  with synchronous, eight-byte-unrolled typed-array loops. It derives all field
  products from upstream's reference implementation, rather than assuming a
  separate polynomial or changing recovery mathematics.
- Check the cooperative deadline every four vector operations. Large recovery
  work can suspend with its buffers and C stack intact, allowing input, audio and
  rendering turns between recovery slices.
- Add bounded, versioned recovery counters to stream snapshots. Recovery wall
  time includes suspension and other work; it is not exclusive CPU time. Yield
  counters distinguish a suspended recovery from an uninterrupted stall.
- Keep production receive batches at 32 and the existing 4+8 ms split for
  demanding streams at 40 Mbps or higher. No larger native waits, decoder ABI
  changes, extra playback buffers or network-system changes were retained.

## Why recovery matters

The [initial 80 Mbps profile](quality80-baseline-switch.txt) averaged 24.4 texture
FPS and 41.1 Mbps RX, with 2.54 seconds of local audio catch-up drops. C pumping
consumed about 20.1 seconds over the short run. Its socket-adapter operations
accounted for roughly 3 seconds, so socket entry overhead alone did not explain
that collapse.

A [recovery-instrumented run](quality80-fec-profile-switch.txt) varied substantially:
54.4 texture FPS, 58.1 decoded FPS, 67.2 Mbps RX. Thirteen recovery calls consumed
681 ms in total; the longest uninterrupted call took 328 ms. That is a concrete
client-side stall during loss recovery. It supports the hypothesis that loss and
expensive recovery can reinforce one another, but does not establish the original
cause of packet loss or prove that Wi-Fi alone is limiting throughput.

The fixed on-device GF workload repeatedly measured about 480 ms with upstream
kernels and 235 ms with the new kernels, approximately a 2.0× improvement in
that byte-operation workload. It is not a 2× improvement in the whole client.
See [original timing/fixture probe](quality80-fec-kernels-switch.txt) and
[revised suspension fixture](quality80-fec-kernels-bounded-switch.txt).
Both early harness runs report failures: the first included synchronous fixture
preparation inside the timed task; the second marked a task complete before its
body had finished. Their kernel equivalence and timing records remain useful,
but neither is counted as a passing suspension test. The [corrected diagnostic](quality80-fec-validated-switch.txt) passes on the Switch: all kernel and recovery checks return zero, recovery yields 447 times and finishes with no tasks. The first 1 ms pump takes 3.14 ms and the maximum measured 2 ms pump takes 8.58 ms, including the fixture checks. This proves resumability without claiming every native call or test check is preemptible. Setup stays outside the timed pump and completion is published after cleanup.

## Sequential comparisons

Means omit the first two connected samples. Scene complexity and LAN conditions
can differ between runs. Requested bitrate is a cap; RX includes FEC, audio and
protocol traffic and does not prove that the host sustained the requested video
bitrate. Texture FPS counts publication, not physical display scanout. Audio
counters are measurements, not a listening assessment.

| Run | Decoded FPS | Texture FPS | RX Mbps | Loop Hz | Audio discarded |
| --- | ---: | ---: | ---: | ---: | ---: |
| [80 Mbps baseline](quality80-baseline-switch.txt) | 24.65 | 24.40 | 41.12 | 38.86 | 2540 ms |
| [50 Mbps baseline](quality80-50mbps-baseline-switch.txt) | 59.62 | 58.50 | 44.66 | 60.00 | 80 ms |
| [60 Mbps baseline](quality80-60mbps-baseline-switch.txt) | 59.59 | 58.83 | 54.90 | 60.01 | 60 ms |
| [80 Mbps, recovery counters](quality80-fec-profile-switch.txt) | 58.12 | 54.38 | 67.21 | 59.11 | 2860 ms |
| [80 Mbps, initial cooperative kernels](quality80-vector-checkpoints-switch.txt) | 18.03 | 17.18 | 28.70 | 59.99 | 2120 ms |
| [60 Mbps, cooperative kernels](quality80-60mbps-cooperative-switch.txt) | 58.98 | 58.41 | 53.72 | 60.01 | 300 ms |
| [80 Mbps, fresh process, 14 ms budget](quality80-fresh-pump14-switch.txt) | 59.40 | 54.11 | 70.19 | 55.24 | 240 ms |
| [60 Mbps, one-minute full UI](quality80-60mbps-full-ui-switch.txt) | 59.23 | 58.30 | 53.12 | 60.00 | 40 ms |
| [40 Mbps, final regression](quality80-40mbps-reloaded-switch.txt) | 59.36 | 58.76 | 36.93 | 60.00 | 0 ms |

The 14 ms trial decoded nearly 60 FPS but could only drive the presentation loop
at about 55 Hz. It handled that run's incoming traffic while consuming too much
of the frame period to publish at 60 Hz. One recovery yielded four times over
35.8 ms; that wall time is not one uninterrupted block. The larger budget is not
retained as a general optimization.

The initial cooperative 80 Mbps trial preserved a 60 Hz event loop but could not
keep up with loss recovery. Faster kernels and yield points alone do not make
80 Mbps reliably smooth; 50/60 Mbps have substantially more promising results.

## Failed receive-batch experiments

Two 64-packet trials failed before usable video arrived:
[initial attempt](quality80-batch64-switch.txt),
[repeat after a clean 32-packet stream](quality80-fresh-batch64-switch.txt).
The logs report video/audio receive failure 48, which the pinned Emscripten
headers define as `ENOMEM`. Shutdown left a task suspended. These are failed
experiments, not valid frame-rate comparisons; the exact native allocation
failure has not been isolated. The 64-packet path is not retained in the app.

The [retained-core check](quality80-retained-core-heap-switch.txt) verified a
unique owned heap witness through the native backing address. The session later
reported stopped, but the [bounded reaper](quality80-reap-stopped-core-switch.txt)
still found one task. Resources were retained and a game restart requested;
unsafe buffers were not freed. A blocked following trial is recorded separately
in [quality80-pump14-switch.txt](quality80-pump14-switch.txt).

## Validation

Local checks passed: 59 application tests, browser UI regressions including all
three new bitrate choices, three Python probe-transport tests, the baseline core
checks, and the actual generated streaming runtime with `WebAssembly` and
`Worker` unavailable. Runtime checks include all 256 GF coefficients, unaligned
rows and tails, in-place scaling, upstream parity equality, 64+16-shard recovery
with 16 erased data shards, recovery suspension/resumption and task cleanup.
The ordinary UI payload remains below CivSwitch's 500 KiB limit.

## Full UI and local exit

The [one-minute 60 Mbps run](quality80-60mbps-full-ui-switch.txt) used the ordinary
UI with its overlay disabled, the unchanged 12 ms budget, and 32-packet receives.
The steady window averaged 58.30 texture FPS / 59.23 decoded FPS and a 60.00 Hz
loop. It recorded 48 frame-number gaps, 40 ms of local PCM catch-up drops, zero
decoder rejections and zero audio FEC failures. Two recovery calls yielded 16
times; their 152.94 ms combined wall time includes suspension.

After measurement, the probe blackholed core stream packets and suppressed RAF,
then injected the local −/+ chord. It detected the chord in 67.18 ms and returned
to Games in 237.74 ms, with state zero / zero tasks and no live loader TCP logs.
The complete post-stop totals were 3636 decoded / 3576 published frames, including
the deliberate fault phase, 29 age expirations and 31 backlog skips. There were
no deferred GPU ticks; all 901 bounded final-fence sequences completed.

The [60 Mbps input stress run](quality80-input60-switch.txt) sent and received
acknowledgements for all 1,200 neutral-controller samples. Median queue-to-socket
was 2.43 ms (p95 6.01 ms); median sample-to-host-ACK was 19.72 ms (p95 29.52 ms).
That measures client scheduling and transport acknowledgement, not physical
button age, host game response or display latency. Shutdown returned state zero
and zero tasks.

A following [40 Mbps regression attempt](quality80-40mbps-regression-switch.txt)
disconnected after its first preparation marker, without a completion marker.
The loader still accepted a small health check; the
[retry](quality80-40mbps-regression-retry-switch.txt) then found the in-memory
streaming factory missing. Neither attempt is a valid frame-rate measurement.
The runtime was re-uploaded rather than assuming success or requesting a further
restart. This repeated-payload runtime-loss issue remains separate from the
measured 80 Mbps steady-state limit.

The [reloaded 40 Mbps regression](quality80-40mbps-reloaded-switch.txt) passed:
59.36 decoded FPS / 58.76 texture FPS, no local audio catch-up drops, no decoder
rejections, no audio FEC failures, and state zero / zero tasks after stop. The
normal UI is loaded with saved 1080p60 / 60 Mbps / Smooth / overlay Off. The
50 and 80 Mbps choices remain available without changing cold-start defaults.

The final artifact is 1,095,188 bytes, SHA-256
`3dc029f5350c26090af6c43f72e961ca484393bc23d1ea683be0a303ef870baf`.
[quality80-summary.json](quality80-summary.json) aggregates the original stream
samples and failed attempts. No result establishes locked 60 FPS or reliably
smooth 80 Mbps, and the source of loss is not attributed exclusively to Wi-Fi.
