# Streaming probes

Run from the repository root while CivSwitch is waiting on port 9026. The Moonlight
UI must be closed. Payloads are tied to the inspected Civ VII/SDK build; raw ABI
offsets are not portable. Native calls can block or abort the game even when the
sender has a timeout. Do not automatically retry a payload after missing completion.

These probes do not call Switch filesystem APIs. Samples are embedded from this
directory; generated output and logs stay under `investigation/` on the Mac.
Successful native media probes stop/destroy their owned objects. A crashed process
requires restarting Civ VII before sending more payloads.

## Reproducing the useful checks

For `Native movie module unavailable`, inspect module discovery without creating
a decoder or invoking movie exports. This standalone probe includes main/SDK
modules, scans up to 2,048 mappings, and reports symbol-table bounds and exact
decoder export matches. The app currently excludes main/SDK, scans 512 mappings,
and accepts at most 10,000 symbols/1 MiB of strings. Its failure does not establish
that the decoder is absent. A user reported this failure on Switch OLED with
Civ VII 1.0.0 at 720p60 while the same app still works on Switch 2. The subsequent
[OLED captures](../evidence/oled-compatibility.md) confirmed that the loaded movie
interface used on Switch 2 is absent from that OLED process. An alternative
OLED backend remains unverified.

```sh
python3 -B investigation/probes/send-probe.py 192.168.1.148 \
  investigation/probes/inspect-streaming-movie-discovery.js \
  --output investigation/evidence/oled-movie-discovery.txt
```

The probe checks the memory-query wrapper before use, validates mapped read
ranges, bounds hash-chain traversal and total queries, frees its scratch buffers,
and reports scan completion. It requires no helper payloads. Its mock checks run
with `node --test tests/test-movie-discovery.cjs`; they are not hardware evidence.

Basic exposed APIs, including a minimal Wasm arithmetic module when the API exists:

```sh
python3 -B investigation/probes/send-probe.py 192.168.1.182 \
  investigation/probes/inspect-streaming-web.js \
  --output investigation/evidence/streaming-web-rerun.txt --timeout 30
```

Thirty paced 720p H.264 frames with pixel checks and a JS timer:

```sh
python3 -B investigation/probes/send-probe.py 192.168.1.182 \
  investigation/probes/native-probe-helpers.js \
  investigation/probes/native-movie-probe-helpers.js \
  investigation/probes/fixtures/h264-sequence.js \
  investigation/probes/inspect-streaming-h264-sequence.js \
  --output investigation/evidence/streaming-h264-sequence-rerun.txt --timeout 25
```

One frame plus temporary PNG preview:

```sh
python3 -B investigation/probes/send-probe.py 192.168.1.182 \
  investigation/probes/native-probe-helpers.js \
  investigation/probes/native-movie-probe-helpers.js \
  investigation/probes/native-pixel-preview-helpers.js \
  investigation/probes/fixtures/h264-nals.js \
  investigation/probes/inspect-streaming-h264-frame.js \
  --output investigation/evidence/streaming-h264-preview-rerun.txt --timeout 25
```

Other final scripts can follow `native-probe-helpers.js`: `inspect-streaming-audio.js`,
`inspect-streaming-thread.js`, and `inspect-streaming-native.js`. The copy/Opus
script additionally needs `fixtures/opus-packets.js`. Movie inspections additionally
need `native-movie-probe-helpers.js`; Wasm internals additionally needs
`native-main-probe-helpers.js`. Inspect each script before sending it. Historical
failed runs are retained as evidence, not recommended commands to rerun.

For the moving fixture, substitute `fixtures/h264-motion-sequence.js` in the
sequence command. Its pixel reference is derived from local FFmpeg decoding.
Current native results match sampled luma and timestamps but fail the complete
color comparison; consult the ledger before interpreting the output.

Read [the feasibility ledger](../evidence/streaming-feasibility.md) before drawing
conclusions from an individual status, export name or timing.
