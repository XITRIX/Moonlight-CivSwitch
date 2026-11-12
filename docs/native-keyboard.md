# Native OS keyboard over Vulkan

Moonlight pairing and Launcher FTP settings borrow the genuine Switch inline
keyboard image and draw it through the shared native UI framebuffer. Civ VII's
`fxs-textbox` and `UI.displayKeyboard()` continue to own input, text validation,
confirmation and cancellation. No replacement keyboard, display reordering,
content-visibility setter or graphics-owner teardown is involved.

The maintained implementation is `CivHomebrew-SDK/src/keyboard.js`, shipped in
SDK 1.3.5. Consumers use checksum-pinned releases; do not patch vendor bundles.
Moonlight's manifest requires native UI `minVersion: 1.3.5`. Its 41-script order
is unchanged and `moonlight-ui.js` remains last. Launcher carries the same helper
in its native UI runtime. Compatible older same-major apps can retain their pins.

## Native contract

On the inspected Civilization VII cartridge 1.0.0 / Switch 2 build, MAIN's image
reader at `+0x51f0c0` checks keyboard state and image-buffer ownership, calls
`nn::swkbd::InlineKeyboard::GetImage(void*, size_t)` and returns either the
borrowed game image or null. Its complete 96-byte body is verified before use;
its entry is checked again before each call. The game state at `+0x5e83550`
provides the image pointer at +32, allocation size at +40, and active state at +48.
The adapter checks pointer identity, active state, mapped permissions and size
before copying 1280×720 RGBA8 pixels synchronously. It never frees a game buffer
or changes native keyboard callbacks.

One overlay lease polls at 33 ms plus rendering cost, uploads available images
through the existing shared framebuffer, and resets layout caches on first show
and close. Reopening reuses the retained texture. A view change or editor close
stops polling and removes the canvas; stale callbacks cannot close a newer lease.
Native image/presentation errors stop the overlay and leave the textbox's IME
callbacks alive until normal confirm/cancel. Diagnostics contain counters and
errors, never entered text or image data.

## Verification, 2026-11-12

The temporary Moonlight pairing trial reused the active SDK 1.3.3 native owner
with the standalone helper; it did not replace an installed app or boot
component. The user confirmed the genuine keyboard was visible, responsive,
and supported confirm, cancel and reopening. The last editor recorded 271 polls,
270 image presentations, zero overlay errors and zero shared renderer errors.
This qualifies the live image path and interaction, separately from cold
activation of the final SDK 1.3.5 package.

The first trial omitted framebuffer dimensions and correctly fell back to USB
entry before native activation. Explicit dimensions and setup/cleanup regressions
corrected that error before the successful trial.

Launcher FTP uses the whole active Launcher view for the overlay, even though
its offscreen textbox lives inside the nested Options panel. Blank activation,
exact replacement on confirmation and preservation on cancel are retained.
After permanent installation and a Civ VII restart, the user confirmed the
Launcher FTP keyboard was working on 2026-11-12. Source/activation checks and
that visible result are recorded separately in
`docs/validation/native-keyboard.json`.

Host coverage includes signature mismatch, changed reader, image bounds,
exclusive/stale leases, view handoff, setup/presentation/redraw failures,
confirmation/cancellation/unload and layout-cache invalidation. Browser checks
exercise actual Moonlight and Launcher UI lifecycles; they do not qualify OS
keyboard rendering on other games, builds, or hardware.

## Prepared update

`dist/moonlight.civapp` and the sibling CivHomebrew
`dist/launcher-nanovg-main.civupdate` are fresh builds using SDK 1.3.5.
`python3 tools/native_keyboard_device.py stage --host SWITCH_IP` verifies source
freshness, saves checksum-verified PC backups, stages only the Launcher inactive
slot, installs Moonlight and checks every installed source. Leave Launcher
Options and close foreground apps first. It deliberately leaves the system in
Terminal until a full Civ VII restart; do not try to mount a different native
owner in the old process. After restart, `verify --host SWITCH_IP` checks the
acknowledged source, keyboard helper, healthy owner and unchanged core, then
returns to Launcher. Launcher 0.4.3-nanovg.12 was staged on 2026-11-12 after the user requested installation. Its stored source byte count and checksum matched the fresh build; core and installed apps were unchanged. After the user restarted Civ VII, readback verified the acknowledged Launcher source and identity, SDK 1.3.5, the permanent keyboard API, a ready native owner and no renderer errors. Launcher was remounted. The installed Moonlight app was unchanged.

Final host results: SDK 58 Node and 19 Python checks plus both stack oracles,
browser and actual host Vulkan passed; Moonlight 146 Node tests, browser and
fresh-package Chrome smoke passed; Launcher 106 Node and 44 Python tests plus
browser passed. Initial sandbox-only Chrome/socket/GPU restrictions were
resolved by running the corresponding host checks with the required access.
