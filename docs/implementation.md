# Implementation notes

A Moonlight UI experiment for CivSwitch's Remote JS Loader. Connect checks
Sunshine, reuses or establishes pairing, then opens a dedicated Games screen
with the host's application list. Password is intentionally absent: GameStream pairing
uses a PIN and a client certificate, not the Sunshine web-interface password.
Streaming, app launching, video, and audio are not implemented.

## Run on Switch

Run commands from the repository root. Start Civilization VII's installed
CivSwitch loader, then run:

```sh
python3 tools/send_ui.py 192.168.1.182
```

The default loader port is 9026 (`--port` overrides it). The sender bundles the
crypto library, dedicated storage, native transport, pairing protocol, app-list
client, and UI into one payload under
the loader's 500 KiB limit. The Mac only sends JavaScript and prints diagnostics;
all Sunshine requests, cryptography, and credential storage run on the Switch.
Keep the sender open. The payload remains pending so the loader does not block
in its next native `accept()`. Close with B before sending another payload.

Default Host is `192.168.1.4:47989`. This prototype supports IPv4 addresses with
an optional HTTP port; DNS and IPv6 are not implemented. HTTPS uses the port
advertised by Sunshine's `/serverinfo` response.

Press Connect. The UI checks Sunshine, creates a client identity if necessary,
and displays a four-digit PIN. Enter it in Sunshine's web interface on the host
(the PIN page, normally `https://localhost:47990`). Pairing waits up to three
minutes for this action. Select Cancel to stop, or B outside editing to close.
A saved pairing is checked through authenticated HTTPS on subsequent connects.
The UI then fetches `/applist` using the same client identity and pinned host
certificate, and switches to Games automatically.

## Games screen

Games shows Sunshine's configured games and applications in host order. The
current host returns Desktop, Steam Big Picture, and Virtual Display; this is
Sunshine's app list, not an automatic scan of the PC's installed games.

- D-pad left/right moves across portrait cards. Up/down moves between rows;
  moving to a row on another page changes the page automatically.
- The grid adapts its column count and shows one or two rows per page to fit
  the viewport. A short final row keeps your intended column when moving back up.
- Down from the last row enters the footer. Left/right switches between Refresh,
  Settings and Back; Up returns to the last card. Tab/Shift+Tab cycles all controls.
- Cards fetch Sunshine's PNG covers through `/appasset`, using the saved client
  identity and pinned native TLS. Covers fill the card above its bottom title
  band. Title initials remain visible while loading or if downloading/decoding fails.
- Only visible-page artwork is queued, with one download at a time and an 8 MiB
  LRU cache of encoded URLs in memory. Each PNG is limited to 2 MiB and 4 megapixels.
  Changing pages replaces queued work; Refresh retries failed images and retains
  successful ones. Returning to Host cancels downloads, retaining the cache for
  the same host. Cached image elements are reused across pages and reconnects.
  Closing the UI or switching hosts releases the memory cache. A separate 16 MiB
  disk cache under `save:/moonlight-experiment/artwork/` survives UI reloads.
  Its keys include the host address, HTTPS port, client identity, pinned host
  certificate, and app ID. PNGs are checked against their saved size and SHA-256
  digest before reuse; missing, corrupt, or rejected images are downloaded again.
  Cache failures leave covers usable through the normal download path. Invalid
  indexes reset only the disposable artwork directory. No migration is performed.
- A selects an entry or activates Refresh/Back. With the streaming core loaded,
  selecting an entry launches or resumes it; see [streaming](streaming.md).
- B returns to the Host screen. B there closes the UI and releases the loader.
- Refresh requests a fresh list over pinned native HTTPS.

Loading, an empty list, and request errors are displayed on this screen. Returning
to Host cancels pending work; a late response cannot reopen Games. Closing still
waits for native sockets to be released. The application list remains in memory;
cached covers and existing credentials stay in the dedicated experiment directory.

Verified on the user's Switch: the portrait grid appears, four-way D-pad
navigation and horizontal Refresh/Back controls work, and B returns to Host.
All three real host covers display on the Switch. The user verified that cached
covers appear immediately after Refresh and returning through Host to Games.

The cartridge has no DOMParser. `sunshine-apps.js` contains a bounded XML parser
for the app-list response, including entity/CDATA decoding, matching tags,
required IDs/titles, and duplicate-ID rejection. App titles render as plain text.

## Persistence

All files created by this experiment on the Switch stay inside **one directory**:

```text
save:/moonlight-experiment/
    pairing-0.json
    pairing-1.json
    settings.json
    artwork/
        index.json
        <56 hex characters>.png
```

The native file writer rejects paths outside this directory, including traversal
components. This rule also applies to future experiment files and diagnostics.
Current diagnostic logs are sent to the Mac and kept in page memory; they do not
create Switch log files. The payload does not write to the SD card or game-save
folders outside this directory.

The two pairing slots contain the stable client ID, private key, certificate,
PKCS#12 credential and authenticated host certificates. Writes alternate slots,
commit the save mount and read back the result. The previous committed slot is
retained if a newer write fails. These credentials are not encrypted by this
prototype. The directory belongs to Civ VII's current save mount/user.

The separate Settings screen is available from Host and Games. It selects
640×360, 960×540, or 1280×720; 15/30/60 FPS; and 1/2/3/5/8/10 Mbps. D-pad
up/down selects a row, left/right adjusts it, and A cycles the value. Back/B
commits the preferences and returns to the previous screen. A failed save keeps
Settings open with an error. The next stream uses a validated snapshot for both
Sunshine launch negotiation and the core stream configuration; a running stream
is unaffected. Unsupported or unreadable stored settings fall back to the
720p/30 FPS/5 Mbps defaults with a diagnostic, without changing pairing data.

To remove all experiment-owned Switch files, close the UI and run:

```sh
python3 tools/send_ui.py 192.168.1.182 --clear-switch-data
```

This deletes only `save:/moonlight-experiment/`, then commits the removal. It does
not modify the CivSwitch installation or other game saves. Deleting the folder
manually has the same effect on app data. Cleanup does not run automatically.
The cleanup path is covered by filesystem fault/recovery tests; it has not been
run against the real paired identity, which is intentionally preserved.

Sunshine's paired-client entry lives on the PC separately. Remove the
**CivSwitch Moonlight** client there when retiring the experiment. Deleting the
Switch directory alone cannot remove that remote entry or historical backups.
Successful reuse after a complete game restart remains a separate verification
step.

## Controls and keyboard

- D-pad up/down: move between Host and Connect, wrapping at the ends.
- A: edit Host or activate Connect/Cancel.
- B: dismiss editing; outside editing, close the UI and cancel pending networking.
- Touch/mouse: select Host or activate the button.
- USB keyboard: type while editing; Enter finishes; Tab/Shift+Tab move focus.

The UI loads Civ VII's own `fxs-textbox` component and calls `onActivate()`.
Runtime inspection of the installed cartridge confirmed `IMEValidated` and
`IMECanceled`. Cleanup waits for the component's callback, explicitly clears its
IME subscriptions, releases the offscreen textbox, focuses the form, and
refreshes input on the next frame. Cancellation restores the original value.
The confirmation wrapper is scoped to this UI and restored after editing.
Keyboard accept/cancel and subsequent D-pad navigation were verified on the
user's Switch 2 on 2026-11-07. Text is left-aligned and vertically centered.

Controller input uses `engine.on("InputAction", ...)`, `navigate-input`, and
`engine-input`, with duplicate-action suppression and held-direction repeat.
Native events take priority; browser gamepads are a preview fallback.

## Hardware verification

On 2026-11-07 the user completed Sunshine PIN approval and the full UI flow
reported `MOONLIGHT_PAIRING_SAVED: new`. Direct status, challenge verification,
native client-certificate TLS, authenticated status, and host save/commit/readback
therefore succeeded on this Switch. A second Connect reloaded the saved pairing
and authenticated without a PIN (`MOONLIGHT_PAIRING_SAVED: reused`).
RSA2048 generation took about two seconds
with BigInt arithmetic. The earlier JSBN-only version stalled during generation.
The first post-pair TLS handshake failed; a subsequent diagnostic succeeded and
the adapter now retries that specific handshake failure up to twice, retaining
certificate verification on every attempt. Evidence and limitations are recorded
in [hardware evidence](../investigation/evidence/README.md).

## Native networking and TLS

The game exposes XMLHttpRequest but the tested external request returned 404;
`fetch` and Web Crypto were absent. Native TCP successfully retrieved Sunshine's
`/serverinfo` directly from the Switch. SDK exports are resolved from the loaded
SDK's MOD0 dynamic symbol table, without hardcoded TLS function addresses.
Socket operations and native TLS run in nonblocking mode with deadlines and
cancellation checks. TLS is restricted to 1.2, imports the paired host certificate
and client PKCS#12, and verifies the exact peer certificate before sending HTTP.
It does not disable certificate verification. GameStream HTTP bootstrap and PIN
challenge exchange follow the normal protocol.

The bundled node-forge 1.4.3 supplies RSA/certificate/PKCS#12 and challenge crypto. RSA modular
exponentiation uses V8 BigInt operations; key generation has bounded steps and
progress updates to avoid long JavaScript arithmetic stalls.
All cryptographic entropy comes from the SDK's
`GenerateCryptographicallyRandomBytes`. Its optional logging compatibility guard
and weak random fallback replacements are documented in [Forge modifications](../app/vendor/forge-NOTICE.md).
There is no Mac network relay and no generated credential shipped in the repo.

## Verification and diagnostics

```sh
node tests/test-pairing.cjs
node tests/test-store.cjs
node tests/test-apps.cjs
node tests/test-ui.cjs  # Requires Chrome; CHROME_BIN can override its path.
node --check app/src/platform/native-network.js
node --check app/src/ui/moonlight-ui.js
```

Protocol tests use independent Node crypto as a fake Sunshine and check complete
pairing, reuse, wrong PIN, tampered hash/signature, HTTP/TLS failures,
cancellation, PKCS#12 import, and rejection of weak randomness. They do not prove
the game SDK ABI or real console TLS behavior.

The sender logs progress and the temporary pairing PIN, never private keys or
certificate payloads. `MOONLIGHT_PAIRING_SAVED` means the final verification and
save write completed. Errors remain visible in the UI and sender terminal.

The scripts in `investigation/probes/` are
standalone diagnostic payloads. The native diagnostic targets the configured
LAN host and lists relevant SDK symbols without invoking TLS or writing files.

## Browser preview

Run `python3 -m http.server 8000 --directory app` from the repository root and open
`http://localhost:8000`. Arrow keys, Enter, Escape, and Tab exercise the layout and
navigation; F8 closes the preview. Pairing and fetching the actual host library require CivSwitch native APIs.
`tests/test-ui.cjs` substitutes a fake paired host for browser-only navigation tests;
`investigation/evidence/games-screen-preview.png` is that test preview.

Protocol references:
[Moonlight Embedded client](https://github.com/moonlight-stream/moonlight-embedded/blob/master/libgamestream/client.c),
[Sunshine GameStream server](https://github.com/LizardByte/Sunshine/blob/master/src/nvhttp.cpp),
[libnx SSL interface](https://github.com/switchbrew/libnx/blob/master/nx/include/switch/services/ssl.h).
