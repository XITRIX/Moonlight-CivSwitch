# NXHID v0.4.4: local CivSwitch playback (unofficial experimental build)

Place CivSwitch's generated `payload.txt` beside `nxhid.nro` on the SOURCE
homebrewed Switch 1. Press **- (Minus)** in NXHID to run the whole keyboard and
controller macro locally. A computer, Python client, and Wi-Fi connection to
the sender are not needed during local playback.

## Readiness update in v0.4.4

A successful keyboard report-descriptor transfer could be forgotten when the
host queued its next SETUP request before the application processed completion.
That left the app waiting even with the bus Configured and Num Lock on. The
completion is now recorded before retiring the transfer for the next request.
Both keyboard and controller initial input deliveries are still required;
this does not bypass USB readiness.

The screen and usb.log now identify the blocked check, with messages such as
`Waiting for keyboard descriptor delivery` or `Waiting for controller input
polling`. A `Readiness:` line reports descriptor, keyboard, controller and
control-transfer state. If playback remains blocked, report both lines.

Host regression tests reproduce Configured plus Num on with readiness stuck
false, then verify that descriptor completion survives the following LED
request. They also verify that missing controller polling still blocks input.
All 91 host tests pass. This build still needs a physical-console retest.
Replace only the NRO and retain your payload.txt.

## Bus-reconfiguration update in v0.4.3

The reported `00001559` at `read USB state` decodes to libnx I/O error 10.
The previous backend generated it whenever USB left Configured after having
been configured once. Treating that transition as fatal could force repeated
USB teardown and repeat the keyboard LED initialization.

This version lets the host move through Default/Address and reconfigure without
closing usb:ds. Pending interrupt transfers are cancelled before their buffers
are reused; interrupted control transfers retire ownership before another
reply. The app sends neutral input again when configuration returns. A valid
report descriptor is retained across a soft reconfiguration on the same physical
connection, and invalidated on physical detach. A disconnect during payload
playback stops that run rather than silently skipping input or resuming.

The screen and usb.log now include USB bus transitions and a restart count.
Real IPC/transfer failures still produce Stage diagnostics. The keyboard's
interrupt OUT endpoint (EP03) and gamepad output echo now follow the PicoSwitch
layout/behavior as well. Keyboard LED updates work on EP0 and EP03; gamepad
output echo works on control and interrupt OUT requests.

New simulated cases cover Configured -> Default -> Address -> Configured,
interrupted EP0 requests, cancelled DMA buffers, keyboard interrupt LEDs, and
gamepad echo. This removes the application's forced-reset path for ordinary bus
transitions; the reason a physical host transitions or resets may still need
hardware diagnosis. Replace only the NRO and retain your payload.txt.

## Control-transfer update in v0.4.2

The reported stage `if1 control IN queue n=63 req=81/06 v=2200 len=63`
means the host requested the keyboard HID report descriptor and usb:ds rejected
queueing that reply. Both lengths are correct; changing payload.txt cannot fix
this stage because payload typing has not started.

This version routes control requests by their target wIndex while preserving
the interface through which the notification arrived. A valid request for our
other interface no longer stalls EP0. Duplicate notifications from both
interfaces are consumed once, including notifications on later polling ticks.
If usb:ds rejects the keyboard report-descriptor IN queue on interface 1 with
00025c8c before accepting a URB, it tries the primary control session once with
the same descriptor bytes and target interface.

Control transfers are now nonblocking and serialized on the shared default
control endpoint. IN data completes before OUT status is queued. New SETUP
requests supersede old requests only after pending DMA completion is retired.
Keyboard ready additionally requires acknowledgement of the keyboard descriptor.

New simulated service cases cover shared notifications, the primary-session
fallback, delayed duplicates, interrupted requests, and readiness gating.
These correct software handling paths consistent with the failure; they do not
prove which usb:ds behavior occurs on the physical console. A hardware retest
is required. Diagnostics and usb.log are retained.

## USB error diagnosis in v0.4.1

If the USB line stays at `Waiting for USB host`, payload playback is disabled.
Code `00025c8c` decodes to USB module 140 / description 302 (2140-0302).
Its exact cause is not identified by that number alone. This build shows a
`Stage:` line with the failed interface, operation, transfer size and latest
control request. It also writes `usb.log` beside the NRO (no payload contents).
The file is replaced at launch and records at most 64 errors per run.

Recovery waits 500 ms between attempts, instead of repeatedly tearing down USB
on consecutive loop iterations. Error notices clear when USB actually recovers.
The gamepad endpoint ordering now matches CivSwitch's PicoSwitch OUT-then-IN
layout. This is a compatibility adjustment, not a verified diagnosis of the
reported hardware error. If the failure persists, report the exact `Stage:` line
or provide `usb.log`. Retain the same `payload.txt`; it is not read until USB
is ready and Minus is pressed.

## Install and run without a remote PC

1. Exit the previous NXHID application on Switch 1.
2. Copy this ZIP's `switch/nxhid/nxhid.nro` to `/switch/nxhid/nxhid.nro` on its SD.
3. Copy your existing generated `CivSwitch/PicoSwitch/payload.txt` to
   `/switch/nxhid/payload.txt` on the SAME Switch 1 SD card.
   Use the generated chat transport file, not raw `core.js`.
4. Launch NXHID in full application mode (hold R while launching a game).
5. Connect Switch 1 USB-C to the target Switch 2 dock's USB-A port with a data
   cable. Wait for `Keyboard ready`. The screen should say `NXHID v0.4.4` and
   show the payload path next to the NRO. Custom NRO directories are supported
   when the homebrew loader supplies the NRO path.
6. On Switch 2, use the original Switch Civ7 cartridge, game version 1.0.0.
   Use English (US) USB keyboard layout and follow CivSwitch's English (US)
   system-language setup. Open MULTIPLAYER -> WIRELESS -> CREATE GAME ->
   HOST LOBBY -> CHAT, then focus its empty chat input.
7. Press **- on the SOURCE Switch 1**. After a five-second countdown, it sends
   the five initial A presses, then Escape, A, each message, and Enter twice,
   with the separator A presses used by CivSwitch's PicoSwitch macro.

The existing target-side wireless lobby requirement remains. Only the sender's
connection to a computer is removed. Keep your existing update/network blocking.

## Controls and progress

- **-** starts from line 1 and reloads `payload.txt` each time. It is ignored
  while playback is already running.
- **B** stops playback and releases keyboard keys/controller buttons.
- **+** exits and releases input.
- The screen shows the current line, character count, status, and payload path.
- Leaving NXHID's foreground or losing USB stops the run and releases input.
- Other remote senders are disconnected/rejected during local playback.
- A missing file or invalid generated payload produces an error before typing.

The full file is validated before playback: printable ASCII, correct message
indices, at most 253 characters per message, no blank messages, and bounded
memory use. CRLF and LF files work. The file is loaded into memory for the run.

Keyboard taps use 40 ms key-down plus 40 ms key-up spacing. Both the press and
release are scheduled locally. This removes the old failure mode where a
Wi-Fi delay between separate key-down/key-up commands could cause auto-repeat.
Screen/Wi-Fi status rendering is deferred while an input is held. This cannot
verify what Civ7 actually displays; stop the run if the target behaves incorrectly.

This local mode restarts the entire file rather than resuming a partial run.
For a clean retry, restart Civ7 and reopen the lobby chat before starting again.
After the default payload succeeds, the TARGET Switch 2 loader should listen
on TCP 9026 for subsequent JavaScript files; that later network step is separate
from this initial typing sequence.

## Optional remote client

The matching `client/nxhid.py` still supports ordinary keyboard forwarding,
controller taps, and automatic CivSwitch playback. Both the new NRO and client
are needed for locally timed remote taps.

To test the previous duplicate-input example in an empty target text field:

```sh
python3 client/nxhid.py 192.168.1.148 text '9/87 8888 1122334455' --atomic
```

To run the whole macro remotely:

```sh
python3 client/nxhid.py 192.168.1.148 civ CivSwitch/PicoSwitch/payload.txt
```

The IP is the SOURCE Switch 1 NXHID address. Remote `civ` supports `--limit 1`,
`--start N`, `--no-preamble`, `--check`, and Ctrl-C. Resume only in the same game
session with exactly the same payload file. The older standalone
`send_civ_nxhid.py` helper uses the previous separate network press/release method.

## Validation and source

The release includes full source, a patch against upstream NXHID commit
`68480849294c2335611c22ed73fb0912a5de34aa`, build information and test results.
Host tests exercise all 87 lines, ASCII/Caps Lock mappings, local hold durations,
missing/invalid files, Minus-to-start without Wi-Fi, B-to-stop, USB/focus errors,
and remote taps during simulated delayed client follow-up.

The NRO was cross-compiled with devkitA64 GCC 16.1.0 and libnx 4.12.0. Physical
Switch 1 / Switch 2 USB compatibility and Civ7 UI timing have not been tested
here. This is an unofficial experimental build.

With devkitPro's `switch-dev` installed, build the source with `make test` and
`make -j4`. To build the original keyboard-only USB backend, run `make clean`
then `make CIVSWITCH=0`; local CivSwitch playback requires the composite build.

Primary sources and attribution:

- NXHID: https://github.com/hyln9/nxhid
- Controller descriptor: https://github.com/Gezine/CivSwitch/blob/main/PicoSwitch/include/SwitchConsts.h
- Macro: https://github.com/Gezine/CivSwitch/blob/main/PicoSwitch/tools/payload_to_macro.py

This build changes input automation. It does not add filesystem escalation or
install a persistent Civ7 save trigger. See LICENSE and THIRD-PARTY-NOTICES.md.
