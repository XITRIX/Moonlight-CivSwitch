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
