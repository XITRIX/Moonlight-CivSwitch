# SDK-based app installation and Switch checks

The initial SDK 1.1 deployment is recorded below. Current SDK 1.3 performance
and final qualification are documented in [SDK performance](sdk-performance.md).

Device: Switch 2, Civ VII 1.0.0; 2026-11-12. These are actual console checks,
separate from browser/GPU host tests. Controller actions and gameplay samples
were injected; physical controller operation and human listening are separate.

Fresh packages were built and inspected before deployment. Launcher
`0.4.3-nanovg.6` (`8f425ac9`) and Hello, Moonlight and Doom all use the pinned
CivHomebrew-SDK 1.1.0 release. Installed scripts were read back as checksums and
lengths and matched the packages; the unrelated CivSwitch Kit entry stayed intact.
Backups were stopped at the user's request; no further source copies were made.

Receipts and bounded diagnostic logs are in `build/sdk-device/`:

| Check | Console result before final core activation |
| --- | --- |
| Hello | Two Launcher accept/action/return cycles; B and Close both work; GPU background pixels match; same renderer owner; no errors. |
| Moonlight | H.264 and AV1 Desktop streams requesting 1920×1080/60, 20 Mbps; presented frames advance; normal disconnect, B navigation and Launcher return; C tasks reach zero; same device/swapchain and restored FTP. |
| Moonlight layout | Six button alignment samples and both 16-line performance overlays match expected native metrics and 140% line spacing. |
| Doom selector | Normal native loading progress caused crashes before the selector. Closing only the loading view allowed all installed scripts to load and the selector to return normally. |
| Doom gameplay | With the paused loading view: shareware E1M1, movement, turning and firing; frames/gametics and sound counters advance; four GPU samples exactly match the C framebuffer; normal exit restores Launcher/FTP and retains one reusable RGBA slot. |

The successful Doom sample presented roughly 6–8 FPS. This is functional engine,
framebuffer and cleanup evidence, not a performance pass. AudioOut queue activity
does not establish human listening confirmation. Moonlight's H.264 pass decoded
some audio; the AV1 pass had no audio packets during the sample. Neither pass
establishes sustained 60 FPS or per-codec audible sound.

## Loading handoff correction

Three Doom launches crashed Civ VII before the selector/engine ran. A bounded
live trace reached the read of `doom-data-15.js`; added delays did not prevent the
failure. The exact native fault remains unidentified. The controlled paused-view
selector and gameplay checks succeeded with identical installed sources.

The resident now awaits the active native view lease's close before the first
ordered child read/eval, retaining the session/device/swapchain. The last frame
remains visible while scripts load; the child mounts its own view. A regression
checks that asynchronous view closure finishes before reading any child script,
with FTP stopped and the same native owner preserved.

The loading fix was subsequently included in core `0.4.3-sdk.4` with SDK 1.3.0
and Launcher `0.4.3-nanovg.8`. Cold activation and two normal Doom gameplay
roundtrips passed, with all 94 ordered reads occurring after view closure.
The fix passed the JavaScript suite, all 60 Python tests (including real FTP after
allowing local sockets), 25 focused component/lifecycle checks, and Chrome native
Launcher/Hello handoffs. No bootstrap/trigger or game saves were changed.
