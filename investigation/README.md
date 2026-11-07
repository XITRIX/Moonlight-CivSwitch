# Investigation

This directory contains research and supporting material. The app sender does
not read or bundle anything here.

- `probes/`: standalone inspection and bounded runtime experiments for keyboard,
  networking, SDK exports, Wasm, native audio and video. Some create temporary
  native resources; see [streaming probe instructions](probes/STREAMING.md).
  These are investigation tools, not app entry points.
- [evidence/](evidence/README.md): observed hardware results, captured logs, and a
  browser test preview. The preview uses a fake host; the notes distinguish
  browser tests from on-console verification.
- `references/CivSwitch/`: the original upstream loader checkout, with its own
  Git metadata, license, installer tools, and documentation preserved.
- `references/nxhid-civswitch-auto/`: the supplied nxhid reference bundle,
  including source, build notes, patches, and Switch binaries.

Run the app with `python3 tools/send_ui.py <SWITCH_IP>` from the repository root.
Implementation details belong in [docs/implementation.md](../docs/implementation.md).

Streaming results and remaining gaps are recorded in
[the feasibility ledger](evidence/streaming-feasibility.md).

[wasm2js/](wasm2js/README.md) builds the cloned Moonlight C core into ordinary
JavaScript, with successful local and on-console algorithm execution recorded
in [the wasm2js evidence](evidence/wasm2js.md).
