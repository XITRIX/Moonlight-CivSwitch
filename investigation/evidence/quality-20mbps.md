# 1080p60 / 20 Mbps — 2026-11-08

Target: user's Switch 2, Civ VII 1.0.0 / CivSwitch, Sunshine at
`192.168.1.4:47989`. Host uses Ethernet; Switch uses Wi-Fi. The user left moving
content playing during these runs. All Switch writes remain under
`save:/moonlight-experiment/`; probes store their evidence on the Mac.

## Result and change

The 20 Mbps request initially stalled video despite a roughly 60 Hz client loop.
Increasing the cooperative pump budget to 14 ms restored decoding but reduced
texture delivery to about 55 FPS. The retained implementation instead batches
native UDP reception, keeping the normal 12 ms budget and 6+6 split. It delivered
about 59 texture updates/sec and 60 decoded frames/sec at the requested 1080p60 /
20,000 kbit/s mode. Settings now offer both 15 and 20 Mbps.

`native-io.js` uses the installed SDK's nonblocking `RecvMMsg` for up to eight
already available datagrams per call. It never waits to fill a batch. Two slots
for connected UDP sockets hold packets in 32 KiB of allocated core heap; a
bounded `copyWithin` supplies each C receive. This is a small heap copy per packet,
not zero-copy. TCP, receives requesting source addresses, large receive buffers,
and additional sockets retain the single-receive path. Poll readiness includes
cached datagrams. Heap replacement rebinds native vectors; interruption is checked
before serving cached packets; metadata and heap storage are released after C
tasks stop. The native function address and implementation signature are checked;
unrecognized SDKs keep the single-receive path.

Poll now borrows the validated core heap directly, removing two native copies
per call. RTP diagnostic keys are formatted at sampling time rather than on every
packet. Neither change alone solved the original 20 Mbps stall. The upstream C
sources and generated wasm2js runtime were unchanged in this experiment.

## Measurements

These are sequential live sessions with changing scenes and LAN conditions,
not identical packet replays. Means omit the first two connected telemetry samples.
Texture FPS is publication to Gameface, not physical display scanout. Sunshine's
variable bitrate does not continually consume the requested cap; RX also includes
audio, FEC and protocol traffic. Details and original result fields are retained
in [quality20-summary.json](quality20-summary.json).

| Run | Decoded FPS | Texture FPS | RX Mbps | Frame receive | Loop Hz |
| --- | ---: | ---: | ---: | ---: | ---: |
| [10 Mbps, original receiver](quality20-10mbps-baseline-switch.txt) | 60.06 | 58.46 | 8.55 | 3.59 ms | 60.02 |
| [20 Mbps, 14 ms diagnostic budget](quality20-20mbps-pump14-switch.txt) | 59.91 | 54.91 | 17.40 | 10.05 ms | 56.57 |
| [20 Mbps, batch receiver / normal 12 ms](quality20-20mbps-batched12-switch.txt) | 59.97 | 58.97 | 18.16 | 2.64 ms | 60.01 |
| [20 Mbps, full UI / overlay off](quality20-full-ui-switch.txt) | 59.95 | 58.72 | 16.63 | 1.87 ms | 60.00 |
| [10 Mbps regression, batch receiver](quality20-10mbps-regression-switch.txt) | 59.69 | 59.40 | 8.66 | 1.51 ms | 60.02 |

The isolated batch run made 16,256 native receive calls for 51,098 C receive
requests, about 68% fewer native crossings. It fetched 41,902 batched datagrams
and served 34,842 cached receives. It reported no video frame gaps, decoder
rejects, audio FEC failures, or local PCM catch-up drops. The full UI also had no
reported gaps/rejects/FEC failures and discarded one stale 20 ms PCM chunk.
Its mean decoder-to-texture age was 34.52 ms; measured ENet RTT averaged 6.24 ms.
The 10 Mbps regression had no reported gaps/rejects/FEC failures or PCM drops.

The [original 20 Mbps run](quality20-20mbps-baseline-switch.txt) stopped advancing
video after 111 decoded frames. The [direct-poll-only run](quality20-20mbps-direct-poll-switch.txt)
also stalled after 165. Both completed teardown with state zero / zero C tasks;
their pacing assertions failed because fewer than 300 frames were delivered.
These were incomplete performance tests, not successful streams or observed
process crashes. The subsequent batching result strongly implicates client
receive overhead in this bottleneck; it does not establish that Wi-Fi never adds
loss or jitter.

## Input, exit and verification

- [20 Mbps input timing](quality20-input-switch.txt): all 80 neutral controller
  samples sent and acknowledged, no pending matches. Median sample-to-socket
  2.378 ms, p95 2.795 ms; median sample-to-host-ACK 7.486 ms, p95 17.971 ms.
  This excludes physical button age, host game response, capture and scanout.
- [Healthy full-UI exit](quality20-full-ui-switch.txt): −/+ returned to Games in
  185.051 ms, with host disconnect acknowledgement, state zero and zero tasks.
- [Simulated outage](quality20-outage-retry-switch.txt): stream I/O blackholed and
  animation callbacks suppressed; −/+ returned in 199.586 ms, with state zero,
  zero tasks and no live loader TCP stream logs. The overlay was actually hidden.
- [Native loopback](quality20-batch-loopback-switch.txt): eight distinct datagrams
  preserved byte contents/order and metadata guards; empty receive returned
  EAGAIN in 1 ms; a partial batch and truncated packet returned immediately with
  correct message length and flags. No extra Switch files were created.
- [Local suite](quality20-local-tests.txt): 52 passing checks, including batch
  order, peek, truncation, zero-length datagrams, cached poll readiness, two slots,
  fd reuse, heap replacement, cancellation, cleanup, disabled fallback and invalid
  native count/length rejection. [Browser suite](quality20-ui-tests.txt) passed
  settings/navigation/overlay/stream UI checks. Its first sandboxed launch lacked
  a Chrome test port; the rerun with the required local process access passed.

One repeated-start outage probe disconnected after `MOONLIGHT_UI_READY`, without
a result or loader completion marker ([wire log](quality20-outage-exit-switch.wire.txt)).
A subsequent [state probe](quality20-post-outage-state-switch.txt) found neither
the UI nor the cached core in the responding loader. Its cause remains unknown;
this is not counted as a passing outage test or attributed to Wi-Fi. Reloading
the core allowed the outage test and then the 10 Mbps regression to pass. The
previously documented intermittent repeated-start failure is not resolved.

The [final UI load](quality20-loaded-ui-switch.txt) records the target preset
saved through the existing settings adapter: 1920×1080, 60 FPS, 20 Mbps, overlay
off. It preserves the existing Smooth/Low latency choice. No migration code or
extra persistent files outside the experiment directory were added. These short
runs establish near-60 FPS delivery, not a locked 60 FPS guarantee or a long-run
stability claim; listening quality still needs the user's assessment.

## Native evidence and reproduction

Bounded installed-SDK reads are retained in
[export inventory](quality20-batch-receive-exports-switch.txt),
[receive code](quality20-batch-receive-code-switch.txt), and
[message-layout code](quality20-batch-message-layout-switch.txt), with corresponding
`.asm.txt` disassemblies. The observed `MMsgHdr` stride is 56 bytes: iovec pointer
at +16, count at +24, received message length at +48. Iovec stride is 16 bytes;
its capacity stays unchanged after receive. Runtime loopback corroborated these
offsets. REA/Hopper analysis is summarized in
[the analysis dossier](quality20-batch-receive-analysis.json), evidence ID
`ev_7fe45023ed37d5486ec986a3a19cc7a0b5ec054ad17ad8c75325173b1ee898ee`.
Decompiler types are inferred and were not treated as an official SDK contract.
The Ghidra provider was unavailable; Hopper succeeded and its session was closed.

```sh
python3 -B investigation/probes/run-frame-pacing.py 192.168.1.182 \
  --continuous --resolution 1080 --fps 60 --bitrate 20000 \
  --output investigation/evidence/quality20-repeat-switch.txt
python3 -B investigation/probes/run-outage-exit.py 192.168.1.182 \
  --skip-upload --resolution 1080 --fps 60 --bitrate 20000 --no-overlay \
  --measure-ms 10000 --output investigation/evidence/quality20-exit-repeat-switch.txt
```

Close the normal UI before sending a probe; run hardware payloads sequentially.
The first command uploads the unchanged core to RAM. Use `--healthy` on the exit
runner to measure normal shutdown instead of simulated failure.
