# 1080p60 / 40 Mbps optimization — 2026-11-08

Target: user's Switch 2 / Civ VII 1.0.0 / CivSwitch, H.264 Sunshine host at
`192.168.1.4:47989`, Ethernet PC and Wi-Fi Switch. The user left moving content
playing. Settings now include 40 Mbps. All persistent Switch writes remain in
`save:/moonlight-experiment/`; diagnostics and staged source are RAM-only.

## Retained changes

- Compile and link the streaming target with `-O3 -flto`. Upstream sources remain
  unchanged. The baseline diagnostic target retains its original options.
- Cached UDP receives avoid constructing native BigInt data pointers unless a
  native receive is needed. Complete-heap validation still precedes access.
- At 40 Mbps, if the first decoder drain did not occupy a render tick, retry it once between
  C pumps. This catches outputs that became ready during the first pump without
  submitting/publishing twice in one tick. A retained GPU transfer occupies the
  tick even when its fence completes.
- At 40 Mbps use a 4+8 ms pump split; other demanding modes retain 6+6 ms and
  lighter modes 4+6 ms. Total C budget stays 12 or 10 ms respectively.
- The final GPU check can use available headroom for nonblocking
  fence polls: at most 3 ms, 32 retries, and no later than the C budget plus
  2 ms (12 or 14 ms) since work began. When C exhausts that headroom there are no extra retries. The old
  one-spare-frame queue and two-period age limit remain. No longer native waits
  or new GPU entry points were introduced. Individual driver calls remain
  non-preemptible.

The initial profile spent about 5.5 seconds in socket operations out of 17.3
seconds pumping C over a roughly 24-second session. Receive buffers were read
back as 262,144 bytes and 1,851,392 bytes. The larger allocation was accepted
after upstream's normal size fallback. This is not evidence of socket-buffer
overflow. No socket initialization or system networking settings were changed.

The larger issue in the full UI was GPU completion timing: C sometimes returned
early while a copy was still pending. Deferring to the next animation tick then
discarded otherwise valid frames as old. The first long UI run's retained
counters reported 225 deferred ticks and 201 age expirations. The bounded final
poll addresses that idle gap rather than adding another buffered frame.

## Measurements

Sequential live runs have different scenes and LAN conditions. Means omit the
first two connected samples. Texture FPS measures native publication, not physical
scanout. Host bitrate is variable; RX includes audio/FEC/protocol traffic and is
below the requested 40 Mbps cap. Original samples remain in the linked logs;
[quality40-summary.json](quality40-summary.json) aggregates the completed and
failed measurement results without treating a loader completion as stream success.

| Run | Decoded FPS | Texture FPS | RX Mbps | Decoder → texture | Video gaps |
| --- | ---: | ---: | ---: | ---: | ---: |
| [Current baseline](quality40-baseline-switch.txt) | 58.54 | 56.12 | 36.11 | 28.80 ms | 14 |
| [O3/LTO, with I/O profiling](quality40-o3-switch.txt) | 59.58 | 57.55 | 33.23 | 29.72 ms | 13 |
| [Reduced receive overhead, profiling](quality40-fast-io-switch.txt) | 59.91 | 58.11 | 33.40 | 28.90 ms | 0 |
| [Mid-frame check, 6+6](quality40-midframe-switch.txt) | 59.48 | 58.96 | 34.63 | 27.13 ms | 12 |
| [Mid-frame check, 4+8](quality40-midframe-4plus8-switch.txt) | 59.72 | 59.53 | 34.26 | 27.75 ms | 6 |
| [One-minute full UI, before final GPU check](quality40-full-ui-long-switch.txt) | 59.60 | 55.80 | 34.14 | 27.72 ms | 25 |
| [Full UI, bounded final GPU check](quality40-ui-tail-reloaded-switch.txt) | 59.90 | 58.76 | 35.38 | 27.45 ms | 0 |
| [One-minute UI, 1.5 ms allowance](quality40-ui-tail-long-switch.txt) | 59.54 | 57.91 | 35.08 | 27.45 ms | 29 |
| [Full UI, final 3 ms allowance](quality40-ui-tail3-switch.txt) | 59.90 | 59.40 | 34.62 | 26.94 ms | 0 |
| [One-minute final UI](quality40-final-long-switch.txt) | 59.60 | 59.48 | 34.19 | 27.37 ms | 26 |

The clean full-UI check reported no decoder rejects, audio FEC failures or local
PCM catch-up drops. It returned to Games in 129.943 ms with host disconnect
acknowledgement and state zero / zero C tasks. These short comparisons do not
isolate compiler benefits from content/network changes, and do not establish
locked 60 FPS or perceptual listening quality.

The final one-minute UI window averaged 59.48 texture FPS / 59.60 decoded FPS,
a 60.00 Hz loop, and 10.32 ms of C pump work per iteration. It reported no local
PCM catch-up drops, decoder rejects or audio FEC failures. The 26 frame-number
gaps remain upstream of presentation; they are not a raw packet-loss percentage,
and this test does not distinguish Wi-Fi loss from source/client receive timing.
The client published about 99.8% of the steady decoded rate. Physical scanout and
button-to-display latency remain unmeasured.

Post-stop counters (including fault/teardown phases) were 3,679 decoded and 3,659
published frames, one deferred tick, one age expiration and 19 backlog drops.
The bounded final check completed 535 of 536 pending transfers; its accumulated
410.674 ms includes normal fence queries over the entire run. For comparison,
the earlier one-minute UI run without the bounded check had 225 deferred ticks
and 201 expirations. These are different live sessions, not a packet replay.

The final outage test blackholed only stream I/O and suppressed animation
callbacks, then returned to Games in **214.863 ms**, with state zero and zero C
tasks. No live stream logs used loader TCP. The overlay was actually hidden.

The initial lower-preset checks still completed and cleaned up but delivered
only 56–57 texture FPS. The retained implementation restricts the extra decoder
drain to 40 Mbps, while bounded GPU completion is useful across presets. The
[final 20 Mbps regression](quality40-20mbps-final-switch.txt) delivered 59.27
texture / 59.87 decoded FPS, with no frame gaps, decoder rejects, audio FEC
failures or local PCM drops. Earlier checks are retained as
`quality40-20mbps-regression-switch.txt` and
`quality40-20mbps-original-cadence-switch.txt`; they are not claimed as successful
performance regressions.

The [final UI load](quality40-loaded-ui-switch.txt) records saving and reading
back 1920×1080 / 60 FPS / 40 Mbps with the overlay off, then `MOONLIGHT_UI_READY`.
The existing pacing preference is preserved. Only the experiment's existing
settings file is written; there is no migration or additional Switch file.

[Input timing](quality40-input-switch.txt), measured before the final bounded
GPU check, sent and acknowledged all 80 samples. Median sample-to-socket was
2.534 ms (p95 3.210 ms); sample-to-host-ACK median 12.895 ms (p95 23.364 ms).
This excludes physical input age, host game response, capture and scanout.
The first long UI outage test returned in 223.961 ms with zero remaining tasks.

## Verification and incomplete experiments

- [Application tests](quality40-local-tests.txt): 58 passed, including conditional
  mid-frame retry, failure cleanup, complete cached-heap validation, GPU deadline
  and query-count caps, and retention/release when a clock or GPU stalls.
- [Browser tests](quality40-ui-tests.txt): 40 Mbps settings, persistence/forwarding,
  game library, fullscreen, input and overlay regression checks passed.
- [Streaming runtime checks](quality40-runtime-tests.txt): actual optimized stream
  artifact passed RTSP/FEC/crypto/unaligned, scheduler, immediate input wake,
  interruption and PNG checks with WebAssembly and Worker globals unavailable.
  The baseline [no-Wasm core tests](quality40-core-tests.txt) also passed.
- [Transport tests](quality40-transport-tests.txt): three passed, including large
  ASCII/Unicode staged source, every upload below 500 KiB, retained lexical native
  scope, RAM-state cleanup and bounded log reconstruction.

A three-period frame-age allowance did not help: the isolated
[trial](quality40-pacer3-switch.txt) reported zero age expirations and 65 backlog
drops. It was removed; no experimental age setting remains in app code. Later
full-UI counters showed a different issue, associated with pending GPU transfers.

The small [retained-counter probe](quality40-ui-last-media-switch.txt) returned
data but lacked the loader completion marker. A subsequent attempt found no
cached streaming runtime. Reloading it allowed the GPU check to pass; the existing
intermittent repeated-start/runtime-loss issue is not considered resolved.
An earlier GPU-check payload exceeded the loader's upload limit before sending
anything. The runner now stages oversized diagnostics in bounded RAM chunks;
it deletes that temporary global before evaluating the awaited payload. The
[missing-runtime attempt](quality40-ui-tail-staged-switch.txt) is an explicit
failed test, not a successful streaming result.

## Build and reproduction

Baseline stream SHA-256:
`6c4f636adde36345a9f0132891a8c5f58c9fecaeb1d7fbb51f3c5951a6c702b3`.
Optimized 1,078,678-byte stream SHA-256:
`6a0143c24d805da78a8ceb751d36839a95914b0140b0e4360237fe33ee9b5526`.
[Build transcript](quality40-runtime-build.txt) records the pinned local toolchain.

```sh
python3 -B investigation/wasm2js/build.py
node -e 'globalThis.WebAssembly=undefined;globalThis.Worker=undefined;require("./investigation/wasm2js/test-runtime.cjs")'
python3 -B investigation/probes/run-outage-exit.py 192.168.1.182 \
  --resolution 1080 --fps 60 --bitrate 40000 --no-overlay --measure-ms 60000 \
  --output investigation/evidence/quality40-repeat-switch.txt
```

Close the app before sending probes and run hardware payloads sequentially.
Add `--healthy` for a normal disconnect instead of simulated stream-I/O failure.
