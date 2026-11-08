# Wreckfest stalls — 2026-11-08

The user completed a race at 1080p60 / 50 Mbps. Most play was smooth, but two
progressively worsening video stalls cleared after pausing to a still image.
The PC continued responding to Switch controls. The user could not reliably
reproduce the issue and suspected an association with controller activity.

## Evidence from the actual session

[Saved session diagnostics](wreckfest-stall-original-session-switch.txt) confirm
50,000 kbit/s, a 12 ms pump, and **reference recovery disabled**. The existing UI
retained only the last periodic snapshot and 64 messages, not a timeline of the
two incidents. The snapshot covers roughly 450 seconds of presentation:

- 25,818 decoded / 25,509 published frames; maximum publication gap **2,797.9 ms**.
- **1,282 frame-number gaps** between submitted decode units. These include
  skipped frames during recovery; they are not a count of lost network packets.
- Logs repeatedly report incomplete video frames, `Waiting for IDR frame`, and
  `IDR frame request sent`. For example, one frame had 25 packets but needed 47.
- **Zero native decoder rejections**, maximum measured decode readiness 43.6 ms,
  and no deferred GPU-transfer ticks. This points upstream of texture rendering.
- 25 completed FEC calls, 2,136.6 ms total wall time including cooperative yields,
  267.0 ms maximum; zero FEC algorithm errors. Insufficient received shards are
  separately reported as unrecoverable frames.
- Maximum cumulative pump duration 546.5 ms, but without timestamps we cannot
  place it in the reported stalls or exclude startup/JIT work.
- 220 ms PCM catch-up drops, no failed audio FEC blocks.

The confirmed failure mode is incomplete video frames followed by repeated IDR
waits. Pausing reduces encoded-video work and can let recovery succeed. This is
consistent with the report, but does not identify whether the original missing
packets came from Wi-Fi, client receive starvation/overflow, or both.

## Controller investigation

The screen sends only changed controller states. The C bridge retains the latest
state in one pending slot; it does not append a JS controller backlog. Input
gets a scheduler turn before audio/video, so activity can consume video headroom
without input itself becoming delayed. Upstream encrypted/reliable input still
uses its existing protocol queue and coalescing.

Two sequential 45-second runs alternated ten-second idle and continuous-neutral
input windows at 50 Mbps, with 1,200 queued neutral updates per run. Both received
about 40 Mbps and near-60-FPS host content. Neutral packets exercise controller
transport/encryption, but do not recreate changing game simulation or rumble.
The first two warm-up samples are omitted from overall means. Input-window
classification uses observed increments of the controller counter and excludes
three initial samples; boundary windows may mix idle and active time.

| Measurement | Previous 50 Mbps path | Updated 50 Mbps path |
| --- | ---: | ---: |
| Overall texture FPS | 59.15 | 59.66 |
| Idle-window texture FPS | 59.31 | 59.31 |
| Input-window texture FPS | 58.98 | 59.93 |
| Received Mbps | 40.33 | 40.37 |
| Maximum measured publication gap | 134.0 ms | 97.8 ms |
| PCM catch-up drops | 0 ms | 0 ms |
| Decoder rejections | 0 | 0 |
| Direct video packets | 0 | 150,075 |
| Copied UDP bytes | 215.15 MB | 4.40 MB |
| Negotiated reference recovery | No | Yes |

[Baseline log](wreckfest-stall-50-baseline-switch.txt),
[updated log](wreckfest-stall-50-recovery-switch.txt).

Neither short run reproduced the severe stall, so this is evidence against
input traffic alone causing an inevitable collapse, not proof of a complete fix.
Scenes and network conditions were not identical packet replays. In both runs,
input windows consumed more pump time; the tests do not isolate its cost from
video scene differences. Both stopped with zero tasks. The updated packet pool
peaked at 86 live entries, had no misses and released all entries on stop.

## Changes retained

- Enable the existing direct C-owned receive batches, packet reuse, paired FEC
  tables and negotiated H.264 reference recovery for **40–80 Mbps GPU streams**.
  Previously all were gated at 80 Mbps, leaving the user's 50 Mbps mode on the
  older loss-recovery path. Preserve existing pump budgets (12 ms at 1080p60 /
  40–70 Mbps, 13.5 ms at 80 Mbps), full upstream FEC, and input priority.
- Keep up to **600 one-second diagnostic samples in RAM**, with controller-update
  counts, FEC, decoder/GPU, packet-path, RTT and frame-rate measurements. Keep the
  final stopped snapshot as well. Reset the history on a new stream; neither
  native pointers nor core heaps are retained by the history.
- Export history only after closing the UI through the existing diagnostic probe.
  No live loader TCP logging or additional Switch files. Persistent data remains
  under `save:/moonlight-experiment/`.

The core binary is unchanged. 65 app tests and the browser UI regression suite
passed, including high-rate profile selection, cancellation/cleanup, detached and
bounded history, and recording with the overlay off/without stream TCP logging.


## Full UI and final load

The [30-second normal UI window](wreckfest-stall-50-full-ui-switch.txt), followed
by a simulated socket outage and suppressed animation callbacks, averaged
**59.40 texture / 59.67 decoded FPS at 40.17 Mbps received** after warm-up. It
recorded 40 ms of PCM catch-up drops, 22 frame-number gaps, no decoder rejections
and no failed audio FEC blocks. Direct reception handled 109,604 video packets;
reference recovery was negotiated. The local chord was detected in 56.3 ms and
returned to Games in **234.9 ms**, with zero tasks and zero live pool entries.

A [post-close history read](wreckfest-stall-history-check-switch.txt) successfully
retrieved **35 samples** plus the final stopped snapshot (state/tasks zero),
including input counters and the simulated outage. Startup samples can show
reference recovery false before negotiation, and rejected controller updates
before the session becomes connected; these are not network delivery failures.
The overlay was off and no loader stream logging occurred during playback.

These short tests did not reproduce the two severe racing stalls. The change
removes the demonstrated 50 Mbps recovery limitation and records enough history
for a future incident; it does not establish that Wi-Fi is fault-free or that
all long-session stalls are fixed.

The [normal updated UI](wreckfest-stall-loaded-ui-switch.txt) was then uploaded
and reported `MOONLIGHT_UI_READY`. Saved preferences were not overwritten; the
user's 1080p60 / 50 Mbps / Smooth setting remains available for the next race.
