# CivSwitch Moonlight

A personal Switch 2 experiment running a Moonlight-style UI inside Civ VII's
CivSwitch loader. Sunshine status, PIN pairing, saved-pair reuse, native TLS,
and the host's game/application list work. Launching and streaming are not implemented.

## Layout

```text
app/
  index.html           Browser preview entry
  src/
    ui/                Host and Games screens, keyboard/controller input
    protocol/          Sunshine pairing and application-list client
    platform/          CivSwitch native sockets, TLS, and file access
    storage/           Persistent pairing store
    clear-switch-data.js
  vendor/              Bundled Forge library, license, and modification notes
tools/                 Payload sender
tests/                 Protocol, storage, and browser UI tests
docs/                  Implementation notes
investigation/
  probes/              Standalone console investigation payloads
  evidence/            Captured results and test preview
  references/          CivSwitch checkout and nxhid reference bundle
```

Only files under `app/` are bundled for the running app. The reference projects
are preserved separately; the upstream checkout stays local, with its original
Git metadata. Its source and revision are recorded in the
[reference notes](investigation/references/README.md).

## Run

From the repository root, with CivSwitch waiting on the Switch:

```sh
python3 tools/send_ui.py 192.168.1.182
```

Keep the sender open. Connect checks Sunshine, uses the saved pairing, and opens
Games. D-pad up/down navigates; A selects; B returns to Host. B on Host closes
the UI and releases the loader for another payload.

For a local UI preview:

```sh
python3 -m http.server 8000 --directory app
```

Open `http://localhost:8000`. Real pairing and host requests need CivSwitch.

## Check

Node 22+ and Python 3 are used by the development tools. No package installation
is needed; the runtime crypto library is bundled.

```sh
npm test
npm run test:ui
```

UI tests need Chrome. Set `CHROME_BIN` if it is not at the default macOS path.

## Switch data

All app-owned Switch files stay inside `save:/moonlight-experiment/`. The native
file-access layer rejects paths outside this directory. To delete its contents
and the directory, close the UI and run:

```sh
python3 tools/send_ui.py 192.168.1.182 --clear-switch-data
```

Sunshine's paired-client entry is stored on the PC separately.

See [implementation notes](docs/implementation.md) for protocol and input
details, and [investigation findings](investigation/README.md) for hardware
evidence and reference material.
