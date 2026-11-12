# Automatic bitrate

Settings → Bitrate → **Auto** starts at **50 Mbps** for every supported codec/resolution/frame-rate combination. It **only decreases** during that launch. Clean playback never triggers a reconnect or a return to a higher bitrate. Manual numeric bitrates stay fixed.

After the first picture and five seconds of startup grace, Auto only reduces for clear video interruptions: **one new frame gap over 250 ms**, **three gaps over 100 ms within ten seconds**, or **two seconds without delivered video**. Reductions are 25%, rounded down to 100 kbps, with a 5 Mbps floor. Missing/nonfinite stall counters, long clock gaps, open menus and suspended input reset the observation boundary.

Audio queue-empty indication, interval jitter, packet loss, RTT, rejected controller updates and a low but steady rendering rate **cannot by themselves trigger a reduction**. An earlier detector incorrectly reduced smooth 50 Mbps playback because audio queue-empty samples accumulated; console trigger records confirmed zero >50 ms video gaps and zero rejected input at those decisions. That false-positive rule was removed and its recorded windows are regression fixtures. Audio counters remain diagnostic indicators rather than proof of audible gaps.

The requested bitrate remains fixed within each moonlight-common-c session, so a necessary reduction still reconnects. Each reconnect sends input releases, awaits C/media/IO cleanup and refresh restoration, then starts the lower-rate session. User exit during cleanup prevents reopening; cleanup failure or retained/quarantined resources prevents another session. The host game is not terminated. The saved choice remains Auto; the next user launch begins at 50 Mbps again.

The original [Moonlight-NX2](https://gitlab.com/Azkali/moonlight-nx2) starting-rate and adaptation modules remain pinned references in [SOURCE.json](../third_party/moonlight-nx2/SOURCE.json), covered by the bundled GPL notices. The active local controller is `app/src/streaming/adaptive-bitrate.js`. NX2's resolution-based initial rates and upward restoration are superseded by the user's 50 Mbps/downward-only preference.

An earlier upward-probing experiment was deployed and user-tested, then rejected because its planned reconnects interrupted gameplay. Upward climbing was removed at the user's explicit request. That experiment is not the current Auto behavior.

Host tests cover 50 Mbps defaults, indefinite clean playback without increases, long/repeated frame-gap reductions, the floor, frozen video, replay of smooth-video false positives, menu pauses, cleanup ownership, exit during reconnect and failed/quarantined cleanup. Browser/package tests cover Auto selection, saving/reopening and app lifetime. Console measurements are recorded separately.

The Launcher was updated to **0.4.3-nanovg.14 / native UI renderer 1.3.6**, staged with a matching previous PC backup and checksum/byte-count readback, then cold-acknowledged after the user restarted Civ VII. The resident core and compatible SDK facade remain at 0.4.3-sdk.9 / 1.3.5. Deployment preflight verifies the renderer release separately from that facade.

The corrected 119.35-second 1080p120 H.264/Auto/overlay-on repeat stayed at **50 Mbps with zero reconnects**, decoded 119.10 FPS and presented 96.84 FPS. It recorded no >100 ms video gaps (maximum 78.80 ms), normal cleanup and restored 60 Hz. No touch/controller activity was recorded in that repeat, so its smooth-input qualification remains separate from the user's preceding confirmation that original 50 Mbps playback was smooth. See [the current console receipt](validation/moonlight-auto-stall-guard.json).
