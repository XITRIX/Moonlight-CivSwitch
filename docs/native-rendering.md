# Native rendering and app switching

Moonlight uses the same NanoVG geometry, font and Vulkan renderer as CivHomebrew.
Production streaming modules use `native-buffer`, `native-context`, `native-cleanup`,
`native-display` and `native-video` names. Historical probes and evidence remain
under `investigation/`; their recorded experimental names are preserved.
Names identify the production architecture; the qualification limits below remain
independent of those names.
Rounded controls, host fields, artwork, stream drawer, mouse and keyboard are
rasterized on the GPU. The layout tree and input callbacks remain the UI model.
The former software bitmap overlay is no longer packaged. The app has one native
output path and one settings file, with no renderer preference. Existing saved
renderer fields are ignored and removed by the next settings save.

## Responsive app layout

Moonlight uses a 1600×900 design workspace. `app/src/ui/layout.js` resolves its
sizes directly into viewport pixels using the smaller width/height ratio, with
no CSS transform and no change to the game's global font or rem size. This makes
controls about 20% smaller than the former 1280×720 layout, with the same
proportions at 720p and 1080p. Panels, dialogs, stream options, mouse controls
and performance text follow the same density policy. The keyboard retains its
original full-width 1280×720 sizing policy, key sizes and height. The native output
surface and video resolution are unchanged.

Settings keeps its eight rows, help text and Back visible together, with fixed
row heights and bounded panel height. Long host lists still scroll. The library
uses design-space dimensions for cards, artwork and pagination, so changing only
pixel resolution preserves the layout; taller aspect ratios can show a second
row. Resize updates preserve selection and current focus colours. The root and
stream panel keep explicit viewport bounds for console overlay layout.

Host validation covers Settings and bitrate choices at 960×540, 1280×720,
1920×1080, 2560×1440, 1024×768 and 2560×1080, plus native-rendered footer/button
alignment, library selection/pagination across resizes and the existing full
navigation/stream control suites. The responsive package was installed on Switch 2 on 2026-11-12; all 41
installed script byte counts/checksums and metadata matched the fresh package.
Launcher returned idle with FTP restored. This verifies installation, not
execution or user-visible confirmation of the new layout on console. The bounded
installation receipt is local at `build/responsive-ui-install/installed.json`.

## Native OS keyboard

Pairing uses the genuine inline Switch keyboard through the shared SDK image overlay. Its textbox still owns input and completion. See [keyboard implementation and evidence](native-keyboard.md) for the native reader guards, lifecycle and qualification limits.

## Controls

| From | Action | Result |
| --- | --- | --- |
| Launcher | Select Moonlight, A | Open Moonlight Hosts |
| Moonlight Hosts | B | Close app resources and return to Launcher |
| Games or Settings | B | Return to the previous Moonlight screen |
| Streaming | Hold − and + together | Open the stream drawer; release before selecting |
| Stream drawer | B | Resume streaming |
| Logout dialog | Disconnect | Leave the PC app running and return to Moonlight Games |
| Logout dialog | Terminate | Close the PC app and return to Moonlight Games |

Use the matching CivHomebrew core `0.4.3-sdk.8` and native Launcher
`0.4.3-nanovg.12`, built in NS2-CivHomebrew with
`python3 tools/nanovg/package-main.py`. Restart Civ VII after a shared SDK upgrade
to activate the new owner safely. Launcher and resident both verify each app's
`extensions.nativeUi` capability against the installed manifest and the active
SDK release. Launcher, Hello, Moonlight and Doom pin SDK 1.3.5 at commit `276347008772de88798f7771b36ccaa47642cecc`. Kit Checks and SW2NES require that same installed SDK without bundling another renderer. All five apps declare `minVersion: 1.3.5`. Incompatible versions produce
an update error before attaching another native view.

## Ownership

`CivNanoVGSession` owns one native device/display/swapchain, one geometry core,
font atlas and retained scene caches. Launcher, terminal and Moonlight take
serialized `attach(root)` view leases. Closing a view disconnects its observers
and input-related refresh work. It never destroys the shared native renderer.
Stale close callbacks cannot detach a later view.

Moonlight's streaming presenter borrows `session.renderer.owner.displayStage`
and its native context. It creates video pipelines against that existing device
and swapchain, retaining those pipelines across sessions. It does not create
another VI layer. The display remains 1920×1080; higher-resolution source video
is scaled to it. A stream surface lease from `renderer.bindSurface()` temporarily
routes completed UI raster output to the video pipeline's RGBA overlay. Native
memory copy transfers those pixels after the UI compute fence completes, without
a JavaScript per-pixel loop. Video and overlay presentations use the same queue
serially.

Disconnect stops core tasks, drains media ownership, restores refresh and waits
for queue idle before releasing the stream surface. The next Moonlight view uses
the normal UI presenter. B from Hosts resolves the app's final lifetime promise
only after cleanup; the resident manager then remounts Launcher and its FTP
service. The app exposes `window.__civswitchApp = {close,lifetime}` for cooperative
resident cleanup. App close keeps the shared renderer alive.

Native failure with uncertain completion still quarantines resources and
requires a process restart. Returning to the original game UI by destroying
native display owners remains outside this flow. The original raw receiver can
run Moonlight, but has no Launcher to remount after close.

## Build and verification

`tools/build-native-ui.py` verifies the exact **CivHomebrew-SDK 1.3.5** release
in `civapps-native-ui.lock.json`, checks the app's capability version and refreshes
packaged license notices. The renderer's sole maintained source is now the
[CivHomebrew-SDK repository](https://github.com/XITRIX/CivHomebrew-SDK).
Launcher, Hello CivHomebrew, Moonlight and Doom consume identical pinned runtime bytes. App builds require neither that library checkout nor a sibling
application. Renderer fixes are released from the library and installed into
all consumers; do not edit vendor bundles.

This extraction requires a matching Launcher update and a Civ VII restart.
Mixed versions and unversioned resident owners are rejected before renderer
modules execute. The current console qualification is recorded in [SDK performance](sdk-performance.md),
separately from the earlier console results below. The browser-only `app/index.html?nativeUi=1` preview executes the
same geometry and raster algorithm with a WebGL oracle.

Run `npm run build`, `npm test`, `npm run test:ui`, `npm run test:native-ui`,
`npm run test:native-ui:gpu`, `npm run package` and `npm run test:package`. Native previews are written under
`build/native-ui`. Host checks cover actual generated geometry, saved preference
migration, compatible service reuse, stream surface bounds, repeated app/view
and stream surface leases, transparent overlay pixels and UI controls. The GPU check executes the exact
packaged SPIR-V through host Vulkan and independently checks transparent pixels
and straight RGBA blending. CivHomebrew
checks cover resident app lifetime/FTP order, native-call fence ordering and
Launcher regressions. These checks are distinct from real console execution.
The completed device qualification is recorded below; host checks remain
separate evidence for their own cases.

## Device installation and bounded roundtrip

`tools/test_switch_roundtrip.py` uses the sibling CivHomebrew checkout's existing
management/raw sender helpers. `prepare HOST` saves a per-script Moonlight backup,
reuses the exact previously verified Launcher PC backup after matching active
metadata, installs Moonlight, and stages the Launcher in its inactive slot. It
independently reads back script lengths/checksums and verifies other apps and the
core state stayed unchanged. It deliberately leaves the current native owner
running; restart Civ VII to activate the pending Launcher, then run `verify HOST`.

After building/inspecting a fresh package matching the installation receipt,
`arm HOST` runs the real installed Launcher → Moonlight → Sunshine/native stream
→ Moonlight → Launcher flow for H.264 and AV1. It injects controller-style and
pointer UI events, temporarily selects 1080p60/20 Mbps without writing saved
settings, and checks media progress, native owner identity, cleanup and FTP
ownership. `extract HOST` is allowed only after the app finishes; it saves the
bounded result and remounts Launcher. These injected events do not qualify
physical controller input or replace user confirmation of picture/audio.

An initial device backup attempt aggregated the old Launcher and Moonlight into
one console-side JSON/base64 report. It disconnected before reporting results;
the user confirmed a game crash. The exact failure point/cause was not established.
No installation had started. After the user's restart, small metadata reads and
one-script-at-a-time backups completed, as did Moonlight installation, inactive
Launcher staging and bounded hash/length readback. Do not reuse the aggregate
backup operation or treat memory pressure as a proven root cause.

## Switch qualification, 2026-11-12

The installed 40-script ordered Moonlight package and native Launcher completed
four Launcher → Moonlight Hosts → Games → real Sunshine stream → Games → Hosts
→ Launcher roundtrips: H.264/AV1 before the layout correction, then H.264/AV1
after it. Each requested 1920×1080, 60 FPS, 20 Mbps. All kept device
`371744211024` and swapchain `371749985920`. Each Disconnect ended with zero C
tasks, no unfinished-stream marker, Launcher visible again and FTP restored;
RPC/raw services remained available. GPU selected-border samples matched teal.

The user confirmed picture and sound during the run and then confirmed the
corrected overlay and button alignment. The final H.264/AV1 samples had 342/584
native video presentations respectively; these counts are not a 60 FPS claim.
The short streams, Desktop activity and audio packet availability do not qualify
sustained gameplay, per-codec audible audio, 120 Hz or higher-resolution scanout.
Input events were injected through the actual UI routes; physical controller
behavior was not separately qualified. The layout viewport was 1280×720 and
native output 1920×1080. Boost state was not re-confirmed for this run.

The initial overlay probe measured computed `lineHeight: "140%"` for authored
`1.4`. The old parser interpreted it as 140 CSS pixels, giving 210 native pixels
between baselines. The corrected shared scene parser resolves percentages using
font size. Both final streams showed 16 lines at 33.6 native pixels per line.
Refresh/Settings/Back now explicitly use flex centering and a 22px line height;
the measured native text centers matched button centers exactly (878.25px).

Launcher `.3` was cold-start acknowledged. Launcher `.4` was an independently
verified scene-module/release-only delta, applied to the existing renderer and
acknowledged in its normal two-slot update. Its device/swapchain stayed unchanged.
Moonlight's first style-fix reinstall hit the older resident's catalog replacement
validation issue. The exact replacement plan/catalog validated without writes;
the established loader installer using explicit list construction succeeded.
Readback verified all 40 source checksums/lengths, Launcher source/state, unchanged
core component and unchanged other apps. No core or boot-trigger update occurred.

Evidence: `investigation/evidence/moonlight-native-roundtrip-qualification.json`,
paired before-layout/final results, installation/cold-verify/layout receipts,
overlay inspection and catalog validation. Backups are recorded by the install
receipts under `build/device-backups`. The final console state is Launcher.

### Settings label alignment qualification

Settings rows explicitly left-align their title column and right-align their
value column; both columns have stable flex widths. They do not inherit the
button's default text alignment. Browser native-renderer checks disable text
Range and verify both edges across six viewport sizes and focus/value changes.

The updated package was installed and all 41 source checksums/byte counts were
verified on Switch 2 on 2026-11-12. The installed app then opened Settings and
changed four temporary draft values/focus states. All eight native text commands
retained X = 610.7999725 across the five samples, with no clipped titles or native
session errors. The console viewport was 1280×720 and text Range was unavailable.
The app closed directly without saving the temporary preferences and returned
to idle Launcher with FTP restored. These are measured console draw-command
positions; human visual confirmation remains separate. Local receipts are under
`build/settings-alignment/` and `build/responsive-ui-install/`.

## Launcher compatibility guard

The SDK checks the resident session before Moonlight creates its screens. A
resident with no native renderer owner displays **Update Launcher** through
Gameface and keeps the foreground lifetime pending. B/Back, Escape or external
app cleanup dismisses it and returns control to the Launcher. Pending native
session initialization is awaited before this decision. Browser previews retain
their existing DOM/WebGL behavior. SDK version checks still reject mixed native
releases; update the Launcher and apps together, then restart Civ VII.

SDK unit fixtures and Chrome package startup cover this path. Console appearance
and controller behavior for this guard have not yet been tested on Switch.


## SDK 1.3.5 alignment and installation, 2026-11-12

All five installed apps (Hello, Moonlight, Doom, Kit Checks and SW2NES) now
require SDK 1.3.5. Vendored consumers pin SDK commit
`276347008772de88798f7771b36ccaa47642cecc`; shared-only consumers declare the
same runtime minimum. Core `0.4.3-sdk.8` and Launcher
`0.4.3-nanovg.12` were source-verified after a full Civ VII restart. Both live
platform and native UI reported SDK 1.3.5, with no renderer errors. Every
installed source, icon and metadata record matched its fresh package.

The initial whole-package Doom RPC crashed Civ VII. Its exact native cause
was not established. After restart, the bounded installer sent one source at
a time, verified all 47 scripts and the icon, and published manifest/catalog
last. No recovery copies were made for this deployment. See
[qualification report](validation/sdk-1.3.5.json). Host integration and installed
readback are distinct from fresh gameplay/streaming qualification.

## Streaming performance repair, 2026-11-12

The Gameface-to-Vulkan review found several changes in the media hot path:

* Every video/UI present previously called `vkQueueWaitIdle` before protocol work
  resumed. Streaming now uses the existing per-slot submission fence and waits
  before the next mapped pixel/control write. Packet reception, FEC and AudioOut
  can overlap the preceding GPU submission. UI updates, refresh restoration and
  surface handoff also drain it; failed completion quarantines the presenter.
* Native H.264 and AV1 readback can write directly into the mapped NV12 slot.
  Bounds, write permissions and alignment are checked before lending it, and
  the preceding graphics fence completes first. H.264 requires zero Y offset;
  unsupported layouts/alignment retain the staging/copy path. This removes one
  3,110,400-byte copy per tightly packed 1080p frame (186.6 MB/s at 60 FPS).
  Hardware decode/untile itself remains; this is not decoder-surface GPU sharing.
* Device testing rejected small per-turn receive allowances: a requested
  2 ms timer still waited roughly 11 ms even with the panel raised to 120 Hz.
  Both requested frame rates now use RAF with bounded between-frame service.
  For native H.264 60 FPS below 80 Mbps, a 13.5 ms work window charges video drain,
  between-frame service and observed pump overruns before assigning remaining
  protocol work. When video is idle, recovery can use more of the window.
  AV1 60 FPS uses 9 ms at up to 20 Mbps and retains 11 ms above that; a
  7.5 ms trial starved recovery during a full-minute 4K test and was rejected. The existing
  80 Mbps allowance is retained. At 120 FPS, the full receive
  allowance and a second presentation opportunity avoid assuming 120 JS turns/s.
  Direct receive, packet reuse, FEC and reference recovery remain enabled.
  Native output retries an empty early drain after the first pump at low
  bitrates too, charging that work to the same H.264 frame deadline.
* H.264 smooth mode now uses its bounded spare-frame pacer on native output.
  Available native outputs expire after two 60 Hz service periods of retention, excluding
  prior decoder time. RAF supplies the 60 Hz cadence. AV1 presents once per
  explicit drain opportunity, including tail queries;
  compressed reference frames are still decoded in order. Low latency bypasses
  the cadence hold. A decode fence that remains pending across service turns
  now has an overall five-second deadline.
* Fixed presentation and AV1 service calls retain the SDK's per-call eight-byte
  signature check using direct reads, avoiding temporary buffers, copies and
  hexadecimal conversion. Their entry points remain whitelisted and range-checked
  at setup, and execution retains the owned stack and canary checks.
* Remote touch/controller/keyboard input no longer invalidates a local scene
  unless a local overlay changes. A mutation/revision stream key avoids
  serializing hidden library markup; normal menus, keyboard, errors, stats and
  settling still update. Repeated native frame notices leave the DOM alone.
* H.264 copy/present timing now includes `GetOutputBuffer` readback. AV1 supplies
  interval/jitter, frame-age and copy/present counters; raw native stats retain
  cumulative acquire/submit/present/fence timings. These remain submission-side
  measurements, not physical scanout timestamps.

This repair has host regression coverage for deferred ownership, direct/fallback
readback selection, pacing, pending decode deadlines, 50 Mbps receive/recovery
configuration and teardown. Subsequent installed Switch tests exercised moving
1080p60/120 content at 50 Mbps with native touch motion, normal disconnect and
repeated launches. See the [performance report](streaming-performance.md) for
frame rates, interval percentiles, pauses, codec limits and cleanup evidence.

## Games progress and running badge, 2026-11-12

The Refreshing popup now gives native font advances enough width and centers
both lines explicitly in flex rows. Long status titles use ellipsis. The running
badge uses an embedded 266-byte transparent PNG: the SDK's limited CSS-border
triangle handling had painted the original right-pointing triangle as a block.
The icon is inside the existing Games script, so package paths/order are unchanged.

Chrome native-raster captures at 720p and 1080p show complete centered text and
the triangular icon. An installed Switch check with DOM Range unavailable
verified both full labels centered within 0.001 native pixels, an image command
for the icon, no renderer errors, unchanged display ownership and normal
Launcher/FTP return. See the [console receipt](validation/moonlight-games-visuals.json).
This is geometry/image-command evidence plus host pixels, not human confirmation
of the final console image. Preview artifacts remain in `build/native-ui/`.

## Native statistics and post-stream navigation follow-up

The original performance qualification disabled the statistics overlay. Enabling
the old 16-line overlay rebuilt text geometry and rasterized/copied the full
1920×1080 UI every second. A subsequent 1080p120/40 Mbps Virtual Display test
measured 76.23 presentations/s, p99 94.96 ms and 14 intervals over 100 ms in
29.37 seconds, with 29 UI redraws.

Streaming statistics now use a 672×88 RGBA badge in the existing fenced badge
slot. It updates with the next video presentation and yields to the local
drawer, keyboard, mouse and dialogs. Full telemetry remains in RAM. No stats DOM
mutation, full UI raster or extra video acquire is needed per sample. Console
checks retain the badge's enabled bit, dimensions, text/background pixel words
and update counters, separately from UI redraw counts.

Movie/audio native calls and transports created after streaming now borrow the
resident graphics context's guarded private stack. TLS certificate, hostname and
password buffers explicitly initialize their NUL terminator. Game-list scene
keys use DOM revisions; native covers use short PNG asset keys on canvas nodes,
avoiding large URLs in scene caches and redundant Gameface image decoding.

The user reported a Civ VII crash after Terminate followed by library navigation.
The original native crash trace is unavailable. Bounded baseline and guarded
terminate/navigation checks are retained in the
[follow-up receipt](validation/moonlight-overlay-followup.json); passing these
checks does not establish the original crash's cause. The receipt also retains
rejected high-refresh scheduling experiments and per-case package hashes.

## Shared fractional text advances, 2026-11-13

Moonlight now pins SDK 1.3.6. NanoVG/Fontstash previously rounded proportional
advances and kerning per glyph; accumulated width differences could move the
last word of an intrinsic menu label onto a clipped second line. The shared
SDK now stores full floating-point advances and uses them for both measurement
and drawing. Its fallback wrapping and horizontal glyph clips share ellipsis's
one-CSS-pixel edge tolerance. Existing script paths and order remain unchanged.

Host checks compare bundled regular/bold font widths against Chrome and long
runs in all three fonts against independent TTF metrics. The app's native-raster
regression disables DOM Range and requires every More-menu label to remain
complete on one line; `build/native-ui/stream-menu-more-no-range.png` records
that host result. SDK and consumer host Vulkan checks cover the generated
geometry/shader path. These are host checks; this release has not yet been
visually qualified on Switch. Install the matching Launcher update and restart
Civ VII to activate the resident renderer; a child app retains an older owner.
