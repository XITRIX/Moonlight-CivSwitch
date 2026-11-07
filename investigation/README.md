# Investigation

This directory contains research and supporting material. The app sender does
not read or bundle anything here.

- `probes/`: standalone read-only payloads for inspecting the shipped keyboard,
  networking APIs, SDK exports, and direct Sunshine status requests. These are
  investigation tools, not app entry points.
- [evidence/](evidence/README.md): observed hardware results, captured logs, and a
  browser test preview. The preview uses a fake host; the notes distinguish
  browser tests from on-console verification.
- `references/CivSwitch/`: the original upstream loader checkout, with its own
  Git metadata, license, installer tools, and documentation preserved.
- `references/nxhid-civswitch-auto/`: the supplied nxhid reference bundle,
  including source, build notes, patches, and Switch binaries.

Run the app with `python3 tools/send_ui.py <SWITCH_IP>` from the repository root.
Implementation details belong in [docs/implementation.md](../docs/implementation.md).
