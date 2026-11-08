# CivSwitch Moonlight

A personal Switch 2 experiment running a Moonlight-style UI inside Civ VII's
CivSwitch loader. Sunshine status, PIN pairing, saved-pair reuse, native TLS,
and the host's game/application list work. An experimental wasm2js streaming
client now launches/resumes apps and decodes real host video on the Switch.

## Package for CivHomebrew

Packaging is a mandatory part of the [Moonlight development routine](AGENTS.md).
Keep `payload.json` and the sender's `APP_SCRIPTS` synchronized whenever runtime
files or their execution order change. Before a handoff or Switch test, rebuild
any affected generated runtime, package the current sources, and inspect the
result. The packager does not automatically update saved source paths.

The repository's `payload.json` is the reusable source manifest. It includes the
built streaming runtime, its CivHomebrew factory adapter, third-party license
notices and the UI dependencies in the same order as `tools/send_ui.py`.
Build the runtime first with `npm run build` if it is absent or stale, then:

```sh
python3 ../NS2-CivHomebrew/tools/package_payload.py --directory . \
  --non-interactive -o dist/moonlight.civapp
python3 ../NS2-CivHomebrew/tools/payload_menu.py inspect dist/moonlight.civapp
node ../NS2-CivHomebrew/tests/moonlight-package.cjs dist/moonlight.civapp
```

Use `--version RELEASE` to update the saved package release, or pass
`--no-save-metadata` for CI overrides. `app/assets/moonlight-switch.png` reuses
Moonlight-Switch's original icon; its pinned source and license are alongside it.
The package contains the full license texts in `app/civapp-notices.js`.
This remains the experimental CivSwitch app, rather than the Moonlight-Switch NRO.
It does not include host credentials or local pairing data. Install through the
CivHomebrew companion; do not send the JSON package as a raw JS payload.

## Layout

```text
app/
  index.html           Browser preview entry
  native/              C cooperative runtime, sockets, callbacks, PNG preview
  src/
    ui/                Hosts, Pair and Games screens, keyboard/controller input
    protocol/          Sunshine pairing and application-list client
    platform/          CivSwitch native sockets, TLS, and file access
    storage/           Persistent pairing store
    streaming/         Launch negotiation, core lifecycle, native media adapters
    clear-switch-data.js
  vendor/              Bundled Forge library, license, and modification notes
tools/
  wasm2js/             Bootstrap, CMake build, guarded compiler transforms
  send_ui.py           App payload sender
  civswitch_sender.py  Shared loader transport
third_party/
  sources.lock.json    Pinned upstream sources and SDK revisions
  moonlight-common-c/  Downloaded dependency, ignored
  mbedtls/             Downloaded dependency, ignored
toolchains/emsdk/      Local pinned SDK, ignored
build/wasm2js/         Generated objects and compiler cache, ignored
dist/runtime/         Generated JS, manifest, and licenses, ignored
tests/
  runtime/             Generated-runtime tests and native C fixtures
                       Other tests cover protocol, storage, and browser UI
docs/                  Implementation notes
investigation/
  probes/              Standalone console investigation payloads
  evidence/            Captured results and test preview
  references/          CivSwitch checkout and nxhid reference bundle
```

App source lives under `app/`; the sender preloads the streaming core from
`dist/runtime/` by default. Use `--no-streaming` for UI-only debugging.
The [runtime build](tools/wasm2js/README.md) uses pinned
dependencies documented in [third_party/](third_party/README.md).
Research checkouts remain separate in
[investigation/references/](investigation/references/README.md).

## Run

For a modded Switch, [JKSV setup](docs/jksv-setup.md) builds the persistent
CivSwitch loader save offline to avoid the chat keyboard bootstrap.

From the repository root, with CivSwitch waiting on the Switch:

```sh
npm run bootstrap
npm run build
python3 tools/send_ui.py 192.168.1.182
```

Bootstrap and build are needed once, then again when the native runtime changes.

Keep the sender open. Hosts lists saved paired PCs; selecting a host opens its
Games. Choose **Pair new host** at the end of the list to open Pair, enter the
host address, and select **Pair**. Successful pairing returns to Hosts with that
host selected. Covers load from Sunshine for the visible page and are cached in memory
and under `save:/moonlight-experiment/artwork/` for reuse after closing the UI.
The D-pad navigates the card grid in four directions; left/right switches
between Refresh, Settings and Back. A selects; B from Games or Pair returns to Hosts. B on Hosts closes
the UI and releases the loader for another payload.

Settings is available on Hosts and in the Games footer. Up/down selects a row;
left/right changes resolution (360p, 540p, 720p, 1080p), frame rate (15, 30, 60 FPS), or
bitrate (1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 80 Mbps). A cycles a value or activates Back. Back/B saves
to `save:/moonlight-experiment/settings.json` and returns to the previous screen.
Changes apply to the next stream. Defaults remain 720p, 30 FPS, 5 Mbps.
80 Mbps is an experimental stress setting; see the
[50/60/80 Mbps measurements](investigation/evidence/quality-80mbps.md).
The [80 Mbps follow-up](investigation/evidence/quality-80mbps-followup.md) records
the newer direct-receive and reference-recovery improvements and live results.
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

For UI-only debugging, skip the streaming runtime upload:

```sh
python3 -B tools/send_ui.py 192.168.1.182 --no-streaming
```

Select a card to launch or resume that app. Video fills the screen while preserving
its aspect ratio; playback controls and status text are hidden once frames arrive.
Press − and + together (or press Escape on a keyboard) to stop and return to Games.
A separate timer checks the local exit chord during rendering stalls; network
shutdown gets at most 100 ms of grace before pending stream I/O is canceled.
Streaming diagnostics stay in RAM to avoid blocking on the loader TCP connection.
The renderer accepts up to 1920×1080 H.264 at 60 fps and the 80 Mbps stress setting, copying decoded
frames directly into an owned Civ VII GPU texture, without JavaScript pixel
conversion or per-frame PNGs. Requested FPS is not a guarantee of display FPS;
see the [current high-bitrate measurements](investigation/evidence/quality-80mbps-followup.md).
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
npm run test:runtime
```

UI tests need Chrome. Set `CHROME_BIN` if it is not at the default macOS path.
Runtime tests require the pinned dependencies and a completed `npm run build`;
they check the generated JavaScript and compiler transforms locally. See
[runtime checks](tests/runtime/README.md). The default `npm test` remains independent
of the downloaded SDK and generated runtime.

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
