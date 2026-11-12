# SDK framebuffer performance, 2026-11-12

CivHomebrew-SDK **1.3.0**, source commit
`f6843e971db0ba8481e35d6188dc4ce16d2c5f4b`, is pinned identically by Launcher,
Hello CivHomebrew, Moonlight and Doom. The renderer changes live in the SDK;
consumer vendor files are installed from its immutable release.

## Changes

* RGBA frames reuse their pixel buffer and update the backend directly, avoiding
  temporary C heap allocations/copies.
* Per-texture revisions retain unchanged atlases and geometry. GPU uploads cover
  changed texture ranges; skipped packets retain all intervening updates. A
  texture-layout change triggers a complete upload.
* Native writes borrow the actual backing-store slice for synchronous memcpy,
  preserving checked pointers, ranges and source-byte verification.
* Framebuffer presentation defers the graphics queue wait until the next upload.
  CPU engine/audio work can overlap the preceding GPU frame. Input buffers and
  submission records are never rewritten before completion. Sampling, readback,
  video-surface handoff, refresh changes and normal close drain pending work;
  failed completion quarantines it. Ordinary UI updates remain synchronous, and
  framebuffer callers can opt out with `deferPresentWait:false`.

## Actual Switch 2 results

Civ VII 1.0.0, installed Fast-mode shareware Doom E1M1, native AudioOut, native
shared framebuffer. Each profile follows a 2.5-second warmup and measures about
eight seconds. Final measurements ran without continuous diagnostic polling.

| Scene | SDK 1.2 FPS | SDK 1.3 FPS | SDK 1.3 presentation ms/frame | Simulation tics/s | Audio buffers/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stationary | 27.26 | 29.35 | 6.00 | 34.95 | 49.87 |
| Turning | 23.50 | 25.24 | 5.80 | 35.06 | 49.98 |
| Firing | 23.25 | 25.37 | 5.79 | 35.02 | 49.88 |

The initial SDK 1.1 mixed gameplay pass ran around 6–8 FPS and averaged 90.43 ms
in presentation. These sequential samples establish a large improvement, not a
simultaneous scene-exact A/B comparison or a locked 35 rendered FPS. The earlier
texture implementation's recorded 34.48/26.92/27.37 FPS still provides context;
its 0.4 ms upload call excludes compositor work included in the SDK's presentation
measurement. Simulation tics are distinct from rendered FPS.

Both final Doom cycles launched through normal Launcher controller actions,
entered gameplay, fired and returned normally. Actual GPU samples matched the C
framebuffer, one reusable RGBA slot remained, audio ownership cleared and FTP
returned. All 94 ordered source reads occurred with the loading view closed; the
shared device/swapchain remained unchanged. The user confirmed good video/audio
in the first optimized pass and accepted the final version for now.

Final SDK 1.3 checks also passed two Hello action/exit cycles and H.264/AV1
Moonlight Desktop streaming roundtrips. Both streams stopped with zero C tasks,
returned to Launcher/FTP and retained the same device/swapchain as Doom. The
successfully pinned public Sunshine route was saved alongside the LAN pairing.
These short stream checks do not establish sustained 60 FPS or per-codec
audibility. The portable combined receipt is
[SDK 1.3 console qualification](validation/sdk-1.3.0.json). Package hashes in that
receipt identify the tested builds before subsequent repository cleanup; local
raw captures remain in `build/sdk-performance-1.3.0/`.

Raw receipts: `build/sdk-performance-1.2.0/doom-result.json` and
`build/sdk-performance-1.3.0/doom-result.json`, plus installation/cold-activation
receipts in those directories. No new device backups were made.

## Host validation

The jitless CPU-only preparation benchmark decreased from a 10.39 ms median in
SDK 1.1 to 0.022 ms in SDK 1.3 for the same 320×200 image and retained HUD. Packed
texture data decreased from 1,304,576 to 256,000 bytes per frame. This measures
preparation only, not console or GPU FPS.

SDK validation includes 36 tests, both checked-stack source oracles, independent
release reproducibility, browser rendering and actual host Vulkan pixel parity.
Consumer packages were rebuilt and inspected, including Moonlight notices and
its 14 packager/162 unit tests, exact-package Chrome smoke, Doom package and
two browser engine handoffs, and Launcher/Hello browser handoffs. Native source
and shader dependencies are unchanged; no C runtime rebuild was required.

SDK commits/releases remain local for the user's own push. The boot trigger and
game saves were not changed.

## Repository cleanup validation

Generic packager/sender tests now live in the SDK alongside renderer/native unit
tests. Moonlight retains app integration tests and exact-package Chrome lifetime
checks. The retired bitmap overlay, its font generator and unused reference atlas
were removed from the app. These maintenance changes have host validation only;
the console results above describe the previously installed builds.
