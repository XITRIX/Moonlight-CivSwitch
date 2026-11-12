# Moonlight streaming performance, 2026-11-12

Actual Switch 2 / Civilization VII 1.0.0 / CivHomebrew-SDK 1.3.5 / resident `0.4.3-sdk.9` measurements. Sunshine streamed Desktop with user-started moving video. The 50 Mbps reference cases requested 1920×1080 at **50,000 kbit/s**, used Smooth pacing, disabled the stats overlay, and included injected native trackpad motion. Boost state was not re-confirmed.

These are sequential live workloads, not replay-identical comparisons. FPS counts fresh video presentations; physical scanout and input-to-display latency were not optically measured. Received bitrate includes variable-rate video and audio/protocol/FEC traffic. A completed harness run establishes lifecycle/cleanup, not achievement of the requested FPS.

## 1080p at 50 Mbps

| Codec | Requested FPS | Sample seconds | Decoded FPS | Presented FPS | Median / p99 interval ms | Maximum ms | Pauses >100 ms | RX Mbps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AV1 | 60 | 30.26 | 55.02 | 55.02 | 18.09 / 20.90 | 149.08 | 2 | 49.02 |
| AV1 | 120 | 29.25 | 58.25 | 58.25 | 14.87 / 49.74 | 67.16 | 0 | 9.74 |
| H264 | 60 | 59.62 | 59.56 | 58.86 | 16.68 / 29.42 | 84.27 | 0 | 40.84 |
| H264 | 120 | 29.29 | 88.39 | 84.29 | 12.86 / 22.82 | 89.25 | 0 | 26.08 |


The AV1 120 FPS sample had sharply lower traffic and predates the user confirmation of looping video. Its stream stopped and restored 60 Hz, but the harness sent Back during input debounce and timed out on Hosts return. The catch closed the app; extraction remounted Launcher. Its presentation counters are retained, without claiming successful normal navigation or a comparable moving workload. The harness now waits for debounce.

The 50 Mbps package is identified by the AV1 install receipt; the only subsequent delta after the H.264 rows is the AV1-specific receive policy, leaving H.264 and high-refresh paths unchanged.

The portable [measurement receipt](validation/moonlight-performance-50mbps.json) preserves each package SHA-256, configuration, raw summary and cleanup/refresh checks. Full one-second samples, frame-interval records and script/icon readback receipts remain under `build/moonlight-performance-50mbps-*`.

## Findings and repair

* A 4 ms protocol allowance with requested 2 ms timers froze reception. Actual short-timer waiting was about 11 ms, including with a 120 Hz panel; Gameface did not supply 120 independent timer turns/s. RAF avoids that wait. High-refresh output gets two explicit native presentation opportunities per turn.
* Native GPU completion now overlaps protocol/audio work, with fences drained before changing mapped pixels/control state, refresh, or handoff. Alignment/bounds-qualified decoder readback can target the mapped NV12 slot directly.
* Fixed Vulkan and AV1 service calls retain their verified eight-byte entry checks and owned native stack while avoiding temporary allocation/copy/hexadecimal checks on each call.
* Touchscreen/remote input no longer invalidates unchanged local UI. A cheap stream revision key avoids serializing hidden game-library markup. Menus, keyboard, errors, stats, layout settling and cleanup still invalidate correctly.
* Native 60 FPS work below 80 Mbps uses a 13.5 ms combined H.264 work window: rendering, between-frame service and pump overruns reduce the next protocol allowance. Idle rendering leaves recovery more of the window. AV1 uses 9 ms at up to 20 Mbps and 11 ms above that; the 80 Mbps stress policy is retained. Native low-rate H.264 retries an empty early drain inside the existing frame deadline.
* Native smooth pacing retains one spare output, bounded by time since decoder availability, rather than expiring newly available output using earlier submission time. At 60 FPS, RAF supplies cadence.

The pre-input-cache 12 ms run averaged 45.32 presented FPS, p99 64.54 ms and a maximum 1512.06 ms pause. The first 120 FPS timer-based run averaged 0.43 presented FPS despite successfully raising the panel. Failed and intermediate runs remain in the receipt instead of being treated as successful qualifications.

## Ownership, refresh and audio limits

Every final completed case must stop C tasks, return through Moonlight to Launcher/FTP and preserve the native device/swapchain. 120 FPS cases additionally read panel flags during streaming and after disconnect: `2` denotes raised 120 Hz and `1` restored 60 Hz. This proves mode selection/restoration, not a locked 120 unique streamed frames/s. The tests did not change core, Launcher, boot trigger, unrelated apps, pairing or saved stream preferences. After final confirmation, the selected 1080p60 H.264/20 Mbps/Smooth profile was saved separately; other input preferences were preserved. All 41 installed scripts and the icon were read back and matched the package.

The receipt retains sampled AudioOut queue-empty episodes/time, catch-ups and discarded PCM. Queue-empty sampling is an underrun indicator, not an exact DSP or human-listening measurement. This run does not independently establish per-codec audible quality or prolonged gameplay/network reliability.

## Reproduction

See [the device helper](../tools/README.md#moonlight-streaming-performance-check). Build/inspect a fresh package, install with `tools/test_moonlight_performance.py install`, arm with `--codec h264` or `av1`, `--fps 60` or `120`, `--simulate-touch`, and collect with `extract` only after normal Launcher return. Use separate output directories and matching install receipts. No TCP diagnostics are emitted during streaming.

Host verification: 163 Node tests, native UI browser input/cache/menu/keyboard checks and exact-package Chrome smoke passed. The earlier generated-C runtime tests also passed; C sources and pinned SDK/shaders were unchanged in this repair.

## Resolution and bitrate sweep

The user confirmed looping moving video before this separate sweep. Every case used Smooth pacing, native trackpad motion and no stats overlay. The shared display remains **1920×1080**: 4K and 1440p are source resolutions downscaled to that output. Samples are sequential live runs, not replay-identical comparisons.

| Case | Source | Codec | Requested FPS | Mbps | Seconds | Presented FPS | p99 ms | Maximum ms | Pauses >100 ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1080p-h264-120-20 | 1920×1080 | H264 | 120 | 20 | 29.30 | 90.80 | 23.47 | 58.19 | 0 |
| 1080p-h264-20 | 1920×1080 | H264 | 60 | 20 | 59.57 | 57.92 | 34.33 | 84.38 | 0 |
| 1080p-h264-20-final | 1920×1080 | H264 | 60 | 20 | 59.57 | 59.19 | 22.29 | 67.85 | 0 |
| 1080p-h264-20-retry | 1920×1080 | H264 | 60 | 20 | 29.30 | 59.52 | 21.87 | 83.92 | 0 |
| 1080p-h264-40 | 1920×1080 | H264 | 60 | 40 | 29.27 | 58.50 | 29.27 | 221.28 | 2 |
| 4k-av1-10 | 3840×2160 | AV1 | 60 | 10 | 30.25 | 55.28 | 21.09 | 61.98 | 0 |
| 4k-av1-20 | 3840×2160 | AV1 | 60 | 20 | 29.28 | 53.11 | 21.06 | 44.81 | 0 |
| 4k-av1-20-7_5ms-rejected | 3840×2160 | AV1 | 60 | 20 | 60.59 | 28.37 | 482.98 | 1300.48 | 79 |
| 4k-av1-20-9ms-long | 3840×2160 | AV1 | 60 | 20 | 59.57 | 57.30 | 22.07 | 55.25 | 0 |
| 4k-av1-20-tuned | 3840×2160 | AV1 | 60 | 20 | 29.26 | 57.35 | 22.23 | 88.13 | 0 |

The 7.5 ms AV1 receive-budget trial is rejected: a full minute exposed packet-recovery starvation and long pauses. The retained low-rate AV1 policy uses 9 ms; higher rates retain 11 ms. Low-rate native H.264 also retries an empty early output check inside its existing frame deadline.

Recommended for this setup: **1080p60, H.264, 20 Mbps, Smooth, stats overlay off**. The final installed build held 59.19 presented FPS over 59.57 measured seconds, with p99 22.29 ms, maximum 67.85 ms, no intervals over 100 ms, zero packet-frame gaps and zero decoder rejections. During 3,601 injected native touch samples there were zero UI snapshots/redraws. Eight intervals still exceeded 50 ms, so this is improved pacing, not a guarantee of perfectly even frames.

The 120 FPS option at 20 Mbps delivered 90.80 FPS, selected 120 Hz and restored 60 Hz; it is not locked 120. The retained 4K60/20 Mbps AV1 setting delivered 57.30 FPS in a full-minute sample and is downscaled to the shared 1080p output. Its mean software submit-to-present age was about 64.74 ms, compared with roughly 25 ms for H.264; neither measures end-to-end input latency.

The [portable sweep receipt](validation/moonlight-quality-tuning.json) records exact package hashes, frame gaps/rejections, audio queue indicators, native touch/UI counters, refresh readings and cleanup. Full RAM samples remain under `build/moonlight-quality-tuning/`.

## Overlay-enabled 120 FPS and termination follow-up

These are later installed-console checks with the statistics overlay enabled. Earlier overlay-off results do not qualify this mode. The user confirmed moving content and D-pad/stick use for the reported crash. Frame submissions are measured; physical scanout and input-to-display latency are not.

| Run | Host app | Requested FPS | Requested Mbps | Seconds | Presented FPS | p99 ms | Maximum ms | Pauses >100 ms | UI redraws |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| moonlight-overlay-120-20-queued | Virtual Display | 120 | 20 | 60.74 | 84.22 | 19.61 | 300.15 | 14 | 0 |
| moonlight-overlay-120-30-queued | Virtual Display | 120 | 30 | 59.70 | 58.86 | 235.53 | 396.65 | 59 | 0 |
| moonlight-overlay-120-40-baseline | Virtual Display | 120 | 40 | 29.37 | 76.23 | 94.96 | 340.11 | 14 | 29 |
| moonlight-overlay-120-40-final | Virtual Display | 120 | 40 | 59.75 | 73.07 | 80.42 | 534.35 | 44 | 0 |
| moonlight-overlay-120-40-guarded | Virtual Display | 120 | 40 | 60.91 | 90.78 | 18.40 | 141.69 | 1 | 0 |
| moonlight-overlay-120-40-interleaved | Virtual Display | 120 | 40 | 29.38 | 47.79 | 343.32 | 772.02 | 34 | 0 |
| moonlight-overlay-120-40-native | Desktop | 120 | 40 | 30.41 | 91.91 | 19.98 | 78.46 | 0 | 0 |
| moonlight-overlay-120-40-queued | Virtual Display | 120 | 40 | 60.72 | 73.63 | 97.04 | 483.24 | 45 | 0 |
| moonlight-overlay-120-40-three | Virtual Display | 120 | 40 | 59.85 | 78.85 | 63.58 | 650.61 | 47 | 0 |
| moonlight-overlay-60-20-queued | Virtual Display | 60 | 20 | 59.95 | 59.18 | 29.95 | 83.60 | 0 | 0 |
| moonlight-terminate-navigation-baseline | Virtual Display | 120 | 40 | 10.15 | 80.78 | 81.13 | 127.02 | 2 | 10 |
| moonlight-terminate-navigation-guarded-1 | Desktop | 120 | 40 | 9.12 | 87.32 | 22.33 | 39.71 | 0 | 0 |

The saved, read-back-verified profile is **1080p60 H.264, 20 Mbps, Smooth, statistics on**. In the later 59.95-second overlay-on run it presented 59.18 FPS, p99 29.95 ms, maximum 83.60 ms, with zero intervals over 100 ms, two over 50 ms, zero frame gaps and zero decoder rejects. Changing-frame samples recorded broad luma changes in 58 of 59 intervals. This is the steadier measured fallback, not locked 60 FPS or a physical audio/scanout qualification. Mouse, touch, rumble and pairing preferences were preserved.

At 120 FPS the current queued-badge build measured 73.63 FPS with 45 intervals over 100 ms at 40 Mbps; 30 Mbps gave 58.86 FPS with 59 such intervals; 20 Mbps improved to 84.22 FPS but still had 14. These are separate sequential one-minute runs, with moving content and the overlay present. Lowering bitrate alone did not establish smooth 120 FPS. The option remains available; no frame-rate cap disguises the result.

The full DOM overlay was replaced by a 672×88 RGBA badge in the existing fenced video overlay slot. Its pixels are queued and copied with a later video submission; stats callbacks no longer force an independent video-fence wait or full UI redraw. Pixel/register checks retain the enabled state and actual text/background data. Full diagnostics remain in RAM. The queued 40 Mbps case measured about 1.71 ms mean / 1.80 ms maximum synchronous stats-hook CPU cost; the deferred pixel copy belongs to the video drain, so those numbers are not the full GPU presentation cost.

The simple third-presentation and 4/4/4 ms interleaved trials were rejected. The retained path uses two explicit native presentation opportunities and the established 12 ms receive allowance. Later 40 Mbps runs still experienced significant frame gaps and recovery pauses, despite zero full UI redraws; do not claim locked 120 FPS or universally smooth 40 Mbps gameplay from the earlier faster sample. These sequential live trials are not replay-identical A/B tests.

The user-reported Civ VII crash was not reproduced in the bounded baseline or repaired termination checks. Each repaired Terminate cycle exercised 48 navigation actions; the portable receipt gives the total. The latest probe includes 24 D-pad and 24 stick-equivalent events. Native movie/audio calls and post-stream TLS/storage calls now reuse the retained guarded native stack; TLS buffers initialize their string terminators. Native covers use short asset keys and canvas nodes, avoiding large cover URLs in cached scenes and duplicate Gameface decoding. These changes address concrete lifetime/ABI/memory risks, but no original crash dump establishes which risk caused that crash. Controller-equivalent injected navigation is distinct from physical controller qualification.

The [portable follow-up receipt](validation/moonlight-overlay-followup.json) records package hashes, every measured case, badge verification, changing-frame samples, termination/navigation counts and cleanup/refresh checks. Raw bounded RAM reports remain under `build/moonlight-overlay-*` and `build/moonlight-terminate-navigation-*`.

Host verification: 168 Node tests, compiled runtime tests, native UI browser checks (including native PNG cover sources), and exact-package Chrome smoke passed. Build/package/inspect completed. SDK and generated module dependencies retain their pinned versions. The skill validator used Ruby for YAML parsing because stock PyYAML was unavailable; the existing validation logic and reference-link checks passed.

## Touch-driven stalls: measured bottlenecks and repair

The user reproduced long freezes with physical finger movement at 1080p120/40 Mbps. An instrumented installed-console run recorded 3,957 physical-contact polls and an 859.52 ms fresh-video gap. During measurement HID/touch calls stayed below 0.90 ms, the packet pump below 18.39 ms, and native drains below 9.33 ms. RAF waiting peaked at 15.93 ms. The long image pauses coincided with missing video frames rather than a single blocking touch or presentation call. This does not identify the location of every lost packet.

The cooperative task profiler found audio receive/decode using roughly 18 seconds per 91-second run. Negotiating 10 ms stereo Opus packets reduced that to about 14.4 seconds; playback remains in two 20 ms native buffers with the same 40 ms prefill and bounded pending chunk. The pinned SDP adaptation advertises arbitrary packet duration and preserves the original RTSP audio quality preset, legacy-server behavior and high-quality surround branch.

The upstream PSA control-crypto path recreated a GCM operation and keyed state for each small mouse/control packet. The checked build-copy adaptation retains the keyed Mbed TLS GCM context per original session context for AES-128 with a 12-byte nonce and 16-byte tag. Every message still supplies its nonce and authenticates its tag. The original replay-window check/update logic, CBC/other-parameter PSA fallback, and original context lifetime remain. Mbed TLS clears keyed state during cache destruction. Pinned third-party checkouts were not edited.

| Installed run | Presented FPS | Decoded FPS | p99 ms | Maximum ms | Pauses >100 ms | Frame gaps | Decoder rejects |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| moonlight-touch-profile-baseline | 70.73 | 84.10 | 71.77 | 859.52 | 62 | 3213 | 0 |
| moonlight-touch-profile-tasks | 76.88 | 96.78 | 30.56 | 662.97 | 38 | 2118 | 0 |
| moonlight-touch-gated-baseline | 83.80 | 108.82 | 36.31 | 373.20 | 1 | 1009 | 183 |
| moonlight-touch-audio10 | 87.81 | 115.87 | 19.31 | 330.26 | 7 | 372 | 0 |
| moonlight-touch-gcm-cache | 89.39 | 119.31 | 18.54 | 71.89 | 0 | 60 | 0 |
| moonlight-touch-gcm-final | 89.96 | 119.28 | 18.83 | 69.56 | 0 | 79 | 0 |
| moonlight-touch-gcm-physical | 83.09 | 109.24 | 20.97 | 527.76 | 38 | 1937 | 0 |
| moonlight-touch-deadlines | 37.16 | 37.17 | 418.76 | 1278.51 | 180 | 9895 | 0 |
| moonlight-touch-fair | 88.56 | 119.05 | 19.81 | 77.09 | 0 | 80 | 0 |
| moonlight-touch-fair-deadlines | 98.36 | 100.81 | 22.48 | 533.63 | 53 | 2298 | 0 |
| moonlight-touch-direct-crypto | 101.45 | 104.03 | 34.47 | 428.54 | 35 | 2859 | 245 |
| moonlight-touch-buffer-accessors | 100.48 | 102.99 | 37.89 | 385.01 | 34 | 3067 | 426 |

The original-vs-cached 100-message console encryption benchmark in the first repaired run measured 162.40 vs 91.32 ms (1.78× faster). Its 30-second forwarding-on phase presented 88.39 FPS, decoded 119.45 FPS, p99 below 20 ms, maximum 64.83 ms, zero intervals over 100 ms, 13 frame gaps and zero decoder rejects. The surrounding forwarding-off phases presented 89.90 and 89.80 FPS. This first repaired case used injected movement; real touch is recorded separately in later runs. It does not establish locked 120 FPS or zero frame loss.

These are sequential live Virtual Display captures with changing content and the overlay enabled, not replay-identical A/B tests. The first two phase comparisons were confounded by physical touch in nominal off phases; the user confirmed this. Later probes gate remote forwarding while keeping HID/DOM contact delivery active. Physical contact counts and injected/suppressed counts are retained in the [portable touch-stall receipt](validation/moonlight-touch-stalls.json). Newer probes also suppress mouse buttons during motion-only measurement to avoid taps at phase boundaries.

All completed cases checked zero remaining C tasks, the same native display owner, 120 Hz flags raised during streaming and restored to 60 Hz afterwards, and normal Launcher/FTP return. Native badge pixels/dimensions confirmed the overlay stayed enabled, with zero full UI redraws in the measured stream. Fresh submissions and buffer evidence are distinct from optical scanout and human smoothness/audio qualification.

Host checks: 174 Node tests; compiled runtime tests including 288 independent Node AES-GCM comparisons over 2,304 changing-nonce messages, rejected tampered tags/replays and released cached contexts; 10 guarded source-adapter tests; exact-package Chrome smoke; fresh build/package/inspect. No runtime scripts or dependencies were added; the 41-path manifest and sender dependency order remain unchanged.

The user reported that the mixed physical/synthetic `gcm-final` test did not move the host mouse. It is **not a valid physical-input success**. A subsequent real-only 180-second test confirmed functioning mouse and controller input but reproduced 38 gaps over 100 ms, maximum 527.76 ms, and 83.09 presented FPS. The no-input ~90 FPS versus ~120 decoded FPS limitation also remained.

A deadline-based presentation trial with short protocol slices regressed to 37.16 FPS and 9,895 missing video frames. It was rejected. Review found that every pump restarted the priority pass, so repeated short slices could starve video/control; the revised scheduler carries its position across budgets. A compiled regression keeps a priority task continuously runnable and verifies that ordinary work still progresses on the next pump. The original dispatch/send/audio ordering remains at the start of each full cycle.

Mbed TLS large-table GCM uses 3,840 more bytes per cached context and preserves the library algorithm. A 200-message no-JIT host benchmark improved cached encryption from 29.74 ms to 17.37 ms; this is a host result. The guarded compiler-load specialization count changed from 378 to 374 with that configuration, and the full compiled tests passed, including independent AEAD, tamper/replay, and in-place buffers.
