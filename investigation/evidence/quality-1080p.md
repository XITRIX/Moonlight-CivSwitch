# 1080p60 quality investigation — 2026-11-08

Target: user's Switch 2 / Civ VII 1.0.0 / CivSwitch, Sunshine at
`192.168.1.4:47989`. The requested mode is H.264, 1920×1080, 60 FPS, 10,000 kbit/s.
All Switch writes remain inside `save:/moonlight-experiment/`.

## Implemented

- Added 1920×1080 to Settings and the launch, decoder and GPU texture bounds.
  CPU NV12/PNG diagnostics retain their existing smaller limits. Defaults remain
  720p30/5 Mbps; the target can be selected without changing pairing or artwork.
- Above 720p, request 1 MiB compressed native input buffers instead of 256 KiB,
  checking each access unit against the actual decoder buffer capacity.
- Request 1392-byte LAN video payloads instead of 1024 bytes. RTP/UDP/IPv4 and
  video encryption headers still fit within a 1500-byte MTU. The client remains
  IPv4 LAN only; no Internet path-MTU discovery is implied.
- Use a 12 ms cooperative budget for 60 FPS modes above 720p or at least 8 Mbps,
  split 6+6 around the nonblocking GPU completion check. Other modes retain
  4+6 ms. Input dispatch and upstream InputSend retain scheduling priority.
- Wake the sleeping dispatch task whenever JS queues controller or keyboard
  input. The upstream protocol and controller layout remain unchanged.

The original bounded one-spare-frame Smooth mode remains. Experiments with
longer deadlines, extra output checks, a permanently larger buffer, and extra
burst capacity did not provide a consistent improvement worth their delay.

## Measurements

These were sequential live runs with changing host content and LAN conditions,
not replayed packets or identical-scene benchmarks. Means below omit the first
two connected telemetry samples. Every original sample remains in the linked
transcripts. Texture FPS measures publication to Gameface, not physical scanout.
The host uses variable bitrate; received bandwidth includes FEC/audio/protocol
traffic and differs from the 10 Mbps request.

| Run | Decoded FPS | Texture FPS | Decoder-to-texture age | Audio skipped |
| --- | ---: | ---: | ---: | ---: |
| [1080p motion, 1024-byte packets / 10 ms](quality-1080p10-motion-switch.txt) | 57.86 | 57.86 | 20.62 ms | 880 ms |
| [1392-byte packets / 10 ms](quality-1080p10-packet1392-switch.txt) | 59.11 | 56.72 | 24.38 ms | 920 ms |
| [Isolated, 12 ms, 4+8 split](quality-1080p10-pump12-switch.txt) | 60.01 | 59.41 | 30.15 ms | 40 ms |
| [Full UI, 6+6 split, overlay on](quality-1080p10-full-ui-finish6-switch.txt) | 59.85 | 56.32 | 32.83 ms | 0 ms |
| [Full UI, 6+6 split, overlay off](quality-1080p10-full-ui-no-overlay-switch.txt) | 60.00 | 58.02 | 33.25 ms | 0 ms |
| [Updated input wake, sparse-input probe](quality-1080p10-input-wake-switch.txt) | 59.91 | 59.53 | 32.10 ms | 0 ms |

The overlay-off full-UI trial recorded a 60.00 Hz loop, about 8.67 Mbps RX,
zero video frame gaps, zero decoder rejects, and zero audio FEC failures. The
overlay-on trial had four frame gaps. The initial continuous-input trial also
encountered six gaps. This is not a guarantee of loss-free Wi-Fi or locked 60 FPS.
The user reported substantially less audio crackling during the 12 ms trial.

The final sparse input probe sent and acknowledged all 80 neutral controller
samples: median sample-to-socket **2.434 ms**, p95 **3.293 ms**; median
sample-to-host-ACK **6.665 ms**, p95 **18.177 ms**. These exclude physical button
age, host game response, capture and display scanout. The early continuous-input
trace's FIFO association included teardown releases; its reported sample latency
is not a trustworthy comparison. The corrected observer freezes new matching
at interruption and suppresses timing if coalescing leaves unmatched samples.

Full-UI healthy exit returned to Games in **167.817 ms** and received the host's
disconnect acknowledgement. With stream socket traffic blackholed and render
callbacks suppressed, the 6+6 test returned in **224.283 ms**. Both ended with
zero C tasks and session state zero, without live loader TCP diagnostics.

## Verification and limits

- `quality-local-tests.txt`: 47 application tests passed, including 1080p mode
  validation, GPU texture ownership and high/low-mode pump budgets.
- `quality-ui-tests.txt`: browser navigation/settings/overlay/stream UI passed.
- `quality-runtime-tests.txt`: rebuilt wasm2js runtime scheduling, immediate
  input wake, interrupted sleep and NV12/PNG checks passed.
- `quality-input-observer-tests.txt`: shutdown release exclusion and late ACK
  handling passed, alongside packet parser bounds and retry correlation.
- `quality-summary.json`: aggregated run details, rejected experiments and scope.

Two 720p regression attempts disconnected immediately after the `preparing`
marker, before the client's first startup status. The second followed a fresh
1080p input test after restart. This repeated-start failure is unresolved and
must not be presented as a successful lower-mode regression or attributed to
Wi-Fi without evidence. The 1080p streams themselves completed and released
their C tasks. Further startup markers distinguish controller setup from the
stream client's native setup in subsequent checks.

The [fresh-process 720p30 check](quality-720p30-fresh-switch.txt) subsequently
passed: mean 30.00 decoded / 29.86 texture FPS, session state zero and no remaining
C tasks after teardown. This verifies the lower mode from a fresh process; it
does not resolve the repeated-start disconnect above.

The [final UI load](quality-loaded-ui-switch.txt) saved the target
1920×1080 / 60 FPS / 10 Mbps preset through the existing settings adapter, with
the optional overlay off for playback performance, and returned
`MOONLIGHT_UI_READY`. Smooth/Low latency remains selectable. This uses only the
existing experiment settings file; no migration or additional persistent files
outside the experiment directory were added.

Run a bounded target-mode measurement with:

```sh
python3 -B investigation/probes/run-frame-pacing.py 192.168.1.182 \
  --continuous --resolution 1080 --fps 60 --bitrate 10000 \
  --output investigation/evidence/quality-target-repeat.txt
```

`--pump-ms` and `--completion-pump-ms` permit bounded phase comparisons without
changing saved preferences. The input and full-UI exit runners also accept the
target resolution and bitrate. Full-UI overlay-off checks assert that the real
StreamScreen overlay was hidden. An earlier incomplete override is retained as
`quality-1080p10-full-ui-overlay-override-incomplete-switch.txt` and is excluded
from the overlay-off comparison.
