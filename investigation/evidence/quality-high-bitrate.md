# Higher-bitrate quality — 2026-11-08

Target: Switch 2 / Civ VII 1.0.0 / CivSwitch, H.264 1920×1080 at 60 FPS,
Sunshine `192.168.1.4:47989`. PC uses Ethernet, Switch uses Wi-Fi. All persistent
Switch writes remain under `save:/moonlight-experiment/`. Probes and logs stay
on the Mac; no host companion or migration code was added.

## Selected mode

Select **25 Mbps** for regular playback, with Smooth pacing and the overlay off.
It raises the prior 20 Mbps cap by 25% while leaving more processing headroom
than 30–40 Mbps. Settings retain 25 and 30 Mbps as new choices. The session
adapter permits 40 Mbps for diagnostic comparisons, but it is not a Settings
preset. This is an observed balance in the current environment, not a hardware
decoder bitrate limit or a promise of locked 60 FPS.

## Implementation

Receive batches grow from eight to 32 already available datagrams. Two packet
slots, their 56-byte message headers and 16-byte iovecs now share one 135,680-byte
(132.5 KiB) core allocation. Native receive writes directly into those regions;
DataView reads each returned length without a separate arbitrary-memory read.
Each C receive still copies one datagram within the heap. The adapter reuses
its DataView and fixed length arrays rather than allocating them per batch.

The existing SDK signature guard, immediate nonblocking behavior, order/peek/
truncation handling, cached poll readiness, interruption priority and fallback
paths remain. Heap replacement rebuilds native pointers before the next batch.
Cleanup releases the shared allocation only after the C tasks finish. The pump
budget remains 12 ms (6+6) for these modes; increasing it would consume rendering
time. Neither upstream C nor the generated wasm2js runtime was rebuilt.

The [32-message loopback](quality-high-loopback32-switch.txt) validates ordered
contents, metadata guard bytes, partial batches, truncation and empty EAGAIN.
The empty and partial native calls each returned in 1 ms. The larger reported
whole-probe duration includes logging and byte-by-byte verification.

## Measurements

Means omit the first two connected telemetry samples. Runs are sequential with
changing scenes and LAN conditions; they are not identical packet replays. FPS
here means native texture publication, not physical display scanout. Requested
bitrate is a cap; variable-rate host output plus audio/FEC/protocol traffic gives
different RX throughput. Original result fields and interval ranges are retained
in [quality-high-summary.json](quality-high-summary.json).

| Run | Decoded FPS | Texture FPS | RX Mbps | Frame receive | Video gaps |
| --- | ---: | ---: | ---: | ---: | ---: |
| [30 Mbps, previous receiver](quality-high-30mbps-switch.txt) | 59.06 | 56.84 | 26.09 | 5.09 ms | 7 |
| [40 Mbps, previous receiver](quality-high-40mbps-switch.txt) | 59.91 | 57.04 | 34.08 | 9.28 ms | 29 |
| [40 Mbps, larger batches/shared metadata](quality-high-40mbps-batch32-motion-switch.txt) | 60.04 | 58.11 | 34.42 | 4.51 ms | 15 |
| [30 Mbps, 60-second continuous-input probe](quality-high-30mbps-batch32-long-switch.txt) | 59.97 | 58.66 | 26.62 | 3.60 ms | 0 |
| [30 Mbps, full UI](quality-high-full-ui-window-switch.txt) | 59.75 | 57.03 | 26.13 | 3.39 ms | 5 |
| [25 Mbps, full UI from fresh process](quality-high-25mbps-ui-fresh-switch.txt) | 59.51 | 58.03 | 21.67 | 2.04 ms | 0 |
| [20 Mbps, same UI regression](quality-high-20mbps-ui-regression-switch.txt) | 59.40 | 58.41 | 17.64 | 1.44 ms | 0 |
| [25 Mbps, one-minute full UI](quality-high-25mbps-long-outage-switch.txt) | 59.27 | 57.05 | 21.54 | 2.41 ms | 0 |

The larger-batch 40 Mbps run made 13,367 native receive calls for 83,736 C receive
requests, versus 17,186 native calls for 80,919 requests in the earlier 40 Mbps
run. Those are different live sessions. Their improved throughput does not
isolate all benefits of batching from network/content differences.

The one-minute 30 Mbps run sent 3,525 neutral controller updates, decoded 3,528
frames and published 3,442 textures. It reported no video gaps, decoder rejects,
audio FEC failures or discarded PCM. The full UI was less consistent, which is
why 30 Mbps was not selected as the playback preset. Its normal measurement
window reported one discarded 20 ms PCM chunk, as did the shorter 25 Mbps UI run.
Both reported zero decoder rejects and audio FEC failures.
The same-process 20 Mbps regression was only 0.38 texture FPS faster than the
fresh-process 25 Mbps check, with the same zero-gap result and one 20 ms PCM
discard. This supports selecting 25 Mbps as a modest quality improvement rather
than accepting the less consistent 30–40 Mbps UI results.

The final one-minute 25 Mbps UI window averaged a 60.00 Hz loop, 9.19 ms of pump
work per iteration, 33.16 ms decoder-to-texture age, and 7.10 ms measured ENet RTT.
It reported zero video gaps, decoder rejects, audio FEC failures and discarded
PCM. Frame delivery still averaged 57.05 FPS: packet continuity does not establish
that every decoded frame was published or physically displayed. These measurements
support a higher-quality near-60 FPS mode, not an achieved locked 60 FPS target.

The exit harness now stops collecting ordinary performance samples before its
fault/RAF-suppression phase. The earlier [30 Mbps UI result](quality-high-full-ui-switch.txt)
included that deliberate rendering interruption and is excluded from the clean
playback comparison. The later `*-window` and 25 Mbps measurements use the fixed
window. The pacing runner now supports bounded 10–120 second tests; the exit
runner supports up to 60 seconds of ordinary playback before fault injection.

## Input, exit, tests and incomplete runs

[30 Mbps input timing](quality-high-input-switch.txt) sent and acknowledged all
80 samples, with no pending matches. Median sample-to-socket was 2.576 ms,
p95 3.056 ms; sample-to-host-ACK median was 8.671 ms, p95 18.223 ms. This was
measured before the final small allocation-reuse change. It does not measure
physical buttons, host game response, capture or scanout, and ACK retries are
not a Wi-Fi packet-loss percentage.

The corrected healthy full-UI checks returned to Games in 131.345 ms at 30 Mbps
and 177.474 ms at 25 Mbps, with host disconnect acknowledgement, session state
zero and zero C tasks. No live stream messages used loader TCP logging, and the
overlay was actually hidden.

After the final one-minute 25 Mbps playback window, simulated stream-socket
failure and suspended animation callbacks still allowed −/+ to return to Games
in **246.645 ms**, with state zero, zero C tasks and no loader TCP stream logs.
The [final UI load](quality-high-loaded-ui-switch.txt) records 1920×1080 / 60 FPS /
25 Mbps with the overlay off, saved and read back through the existing settings
adapter. The existing frame-pacing preference is preserved. This writes no
additional persistent files beyond the experiment's existing settings file.

[Application tests](quality-high-local-tests.txt): 53 passed, including all 32
batch slots and crossing into the next batch, heap replacement, metadata bounds,
cancellation and ownership cleanup. [Browser tests](quality-high-ui-tests.txt)
passed extended bitrate navigation, save/forwarding, input, overlay and existing
library flows. An initial assertion overstepped the old 20 Mbps endpoint after
the list grew; it was corrected and the suite passed.

An initial larger-batch run received only about 11 FPS and 1.7 Mbps
([log](quality-high-40mbps-batch32-switch.txt)). The user restarted steady motion;
the next test received 34.42 Mbps. The low-motion run failed the minimum-frame
assertion and is not a capacity result.

The first 25 Mbps UI attempt disconnected after UI ready without a result
([wire log](quality-high-25mbps-ui-switch.wire.txt)); the loader then refused
connections. After the user's Civ VII restart, the 25 Mbps full-UI check passed.
The existing intermittent repeated-start failure remains unresolved and is not
attributed to bitrate or Wi-Fi on this evidence.

## Reproduction

Close the ordinary UI before probes and run hardware payloads sequentially.

```sh
python3 -B investigation/probes/run-outage-exit.py 192.168.1.182 \
  --healthy --resolution 1080 --fps 60 --bitrate 25000 --no-overlay \
  --measure-ms 20000 --output investigation/evidence/quality-high-repeat-switch.txt
python3 -B investigation/probes/run-frame-pacing.py 192.168.1.182 \
  --skip-upload --continuous --resolution 1080 --fps 60 --bitrate 30000 \
  --duration-ms 60000 --output investigation/evidence/quality-high-repeat30-switch.txt
```

Omit `--healthy` to blackhole only core stream traffic, suppress animation
callbacks and verify local −/+ exit after the ordinary playback window.
