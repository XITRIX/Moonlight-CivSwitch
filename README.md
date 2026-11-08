# CivSwitch Moonlight

A personal Switch 2 experiment running a Moonlight-style UI inside Civ VII's
CivSwitch loader. Sunshine status, PIN pairing, saved-pair reuse, native TLS,
and the host's game/application list work. An experimental wasm2js streaming
client now launches/resumes apps and decodes real host video on the Switch.

## Layout

```text
app/
  index.html           Browser preview entry
  native/              C cooperative runtime, sockets, callbacks, PNG preview
  src/
    ui/                Host and Games screens, keyboard/controller input
    protocol/          Sunshine pairing and application-list client
    platform/          CivSwitch native sockets, TLS, and file access
    storage/           Persistent pairing store
    streaming/         Launch negotiation, core lifecycle, native media adapters
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

App source lives under `app/`; `--streaming` also preloads the generated core
from `investigation/wasm2js/dist/`. The reference projects
are preserved separately; the upstream checkout stays local, with its original
Git metadata. Its source and revision are recorded in the
[reference notes](investigation/references/README.md).

## Run

From the repository root, with CivSwitch waiting on the Switch:

```sh
python3 tools/send_ui.py 192.168.1.182
```

Keep the sender open. Connect checks Sunshine, uses the saved pairing, and opens
Games. Covers load from Sunshine for the visible page and are cached in memory
and under `save:/moonlight-experiment/artwork/` for reuse after closing the UI.
The D-pad navigates the card grid in four directions; left/right switches
between Refresh, Settings and Back. A selects; B returns to Host. B on Host closes
the UI and releases the loader for another payload.

Settings is available on Host and in the Games footer. Up/down selects a row;
left/right changes resolution (360p, 540p, 720p, 1080p), frame rate (15, 30, 60 FPS), or
bitrate (1, 2, 3, 5, 8, 10, 15, 20, 25, 30 Mbps). A cycles a value or activates Back. Back/B saves
to `save:/moonlight-experiment/settings.json` and returns to the previous screen.
Changes apply to the next stream. Defaults remain 720p, 30 FPS, 5 Mbps.
**Frame pacing** offers Smooth (default) and Low latency. Smooth keeps one spare
decoded frame at 60 FPS for steadier delivery, adding up to one frame of buffering.
The saved **Performance overlay** switch enables in-stream FPS, RTT/variation,
receive/decode/copy timing, frame pacing, decoder/audio buffering and loss
indicators. It defaults to Off. Statistics describe texture submissions, rather
than physical display timing.
Low latency presents the newest ready decoded frame per drain. Audio keeps at most
60 ms of completed PCM plus a partial chunk under 20 ms, skipping stale waiting
samples if the queue fills. The overlay shows intentional video/audio skips
separately from network loss indicators.

To enable streaming, build the pinned core once and preload it:

```sh
python3 -B investigation/wasm2js/bootstrap.py
python3 -B investigation/wasm2js/build.py
python3 -B tools/send_ui.py 192.168.1.182 --streaming
```

Select a card to launch or resume that app. Video fills the screen while preserving
its aspect ratio; playback controls and status text are hidden once frames arrive.
Press − and + together (or press Escape on a keyboard) to stop and return to Games.
A separate timer checks the local exit chord during rendering stalls; network
shutdown gets at most 100 ms of grace before pending stream I/O is canceled.
Streaming diagnostics stay in RAM to avoid blocking on the loader TCP connection.
The renderer supports up to 1920×1080 H.264 at 60 fps and 30 Mbps, copying decoded
frames directly into an owned Civ VII GPU texture, without JavaScript pixel
conversion or per-frame PNGs. Requested FPS is not a guarantee of display FPS;
see the [higher-bitrate measurements](investigation/evidence/quality-high-bitrate.md).
It remains a prototype; gameplay latency has not been measured. Native stereo
Opus/PCM output and remote controller/keyboard forwarding are wired in.
See [streaming implementation and evidence](docs/streaming.md).

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
