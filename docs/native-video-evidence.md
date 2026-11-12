# Native video evidence

Current Moonlight uses native UI and video output throughout. H.264 is the
default codec; AV1 and high source resolutions are available in Settings.
Existing preferences load into the single Moonlight application and use
`settings.json`. See [current rendering and app switching](native-rendering.md).

The records below describe earlier bounded experiments. They establish the
specific operations and workloads recorded, rather than console qualification
of the new shared Launcher/app/stream lifecycle. The earlier stopped-display
and restart limits apply to the independent display tests, not the new host-tested
shared view/surface lease implementation.

## Evidence

All console records below came from Switch 2, Civ VII Switch 1 cartridge 1.0.0,
CivHomebrew 0.4.3, nnCompat table hash `cf649bbd`. The user explicitly confirmed
Boost was off and the initial stripe pattern was visible.

| Check | Recorded result | Limit |
| --- | --- | --- |
| Module/export inspection | Required native display exports and checked caller found; the previous UI renderer 1280×720 | Does not establish performance |
| Independent 1080p display | 1920×1080 swapchain, two images, 120 test frames in 2002 ms; steady 59.59 FPS | Synthetic display workload; physical scanout not optically measured |
| 120 Hz presentation | Panel flags changed from `0x1` to `0x2`, interval set to 1/120; 120 frames in 1015 ms, steady 117.59 FPS | Synthetic rendering, no streaming protocol workload |
| Refresh restoration | Original interval and `0x1` flags restored; explicit completion | No claim about every failure path |
| AV1 reference frames | 1920×1080, 2560×1440 and 3840×2160 decoded; four YUV samples each matched FFmpeg's `[135,170,81]`; timestamps matched | One solid-color frame per size, not a full-frame parity or throughput test |
| AV1 cleanup | Stop, unregister, surface destruction, handle closure and keeper cleanup completed for all three sizes | Repeated gameplay and failure recovery remain unqualified |
| Direct H.264 1080p stream | 140 frames presented, no client error, zero remaining C tasks | Idle Desktop supplied roughly 10 FPS and no audio; the first probe's audio-traffic assertion therefore failed |
| Direct AV1 1080p stream | 151 frames decoded/presented, zero decoder rejections, no client error, zero remaining C tasks | Same idle/silent Desktop; not a 60 FPS/audio qualification |
| H.264 retry after restart | 30-second run: 307 decoded, 306 presented, 10.60 measured presentation FPS, no client error, zero remaining C tasks; user confirmed the PC image visible | No audio traffic received; moving-content performance and audible output remain unqualified |
| AV1 moving-content/audio run | Requested 1080p60 at 20 Mbps for 45 seconds with Boost off: 2,519 frames decoded/presented, 57.23 FPS over the 43.735-second sampled interval, 8,733 Opus packets decoded; user confirmed picture and audible sound | 19 compressed-frame rejections, one audio catch-up/drop, 758 ms accumulated empty-queue accounting; not a locked 60 FPS or long gameplay qualification |
| AV1 motion cleanup | No client error, zero remaining C tasks, no unfinished-stream marker; native layer retired and management idle | User confirmed the last PC image remains visible |
| Owned-layer return | Queue wait and Layer::Close completed; loader success | Close request did not clear the visible image; restart required |
| Native −/+ menu regression | User confirmed Resume/Disconnect appeared, B resumed AV1 video, and explicit Disconnect showed STREAM STOPPED/restart; 841 frames decoded, 610 presented, zero remaining C tasks, no client error or unfinished-stream marker | Presentation intentionally pauses in the menu while decoding continues; this run had an idle/silent host and does not revise performance/audio qualification |

Raw logs are `investigation/evidence/experimental-*.txt`. Failed setup attempts
are retained: the first two refresh tests refused before changing the rate
because the retained display used an older local command adapter. The live
sender initially refused an oversized test before execution; it now uses the
existing bounded in-memory staging protocol. These failures are not counted as
device capability failures.

## Implementation and builds

`third_party/moonlight-nx2/SOURCE.json` records the exact supplied reference
subset and SHA-256 hashes. The original sources and shaders remain unmodified.
`tools/build-native-runtime.py` verifies them and bundles only console
display/decoder modules with private byte-buffer and local-call adapters. Node
filesystem imports read only in-memory records; pipeline caching is disabled.
No host transport or Moonlight helper is bundled. The original license and
attribution are included in `app/civapp-notices.js`.

Our cooperative Moonlight C core now permits explicit H.264 or AV1 Main8
selection. The integration keeps codec choice immutable while C tasks exist,
keeps AVC reference-recovery capability specific to H.264, and routes compressed
AV1 into a bounded native queue. AV1 setup runs between C pump turns; fence polls
are nonblocking. H.264 native output uses checked NV12 planes without copying
decoded pixels through JavaScript. Both paths still have native frame copies;
neither is described as zero-copy decoding.

`npm run build` rebuilds the streaming artifact and experimental bundle.
`payload.json`, the raw sender and the browser preview include the dependencies
in order, with `moonlight-ui.js` last. Standard package validation is mandatory.
`npm run test:package` validates the Moonlight metadata, pending UI lifetime and clean close in Chrome.

Earlier validation passed: 124 unit tests, the compiled runtime checks, the full
browser UI suite, and package smoke tests. A UI rerun also passed
after an earlier Chrome cleanup failure. These are host checks, separate from
the console evidence above. Earlier separately installed test builds have been
retired in favor of the single Moonlight package.

After the host laptop lost power, Sunshine responded again. A read-only console
check found the previous display retained and retired, with no unfinished
stream. The user restarted CivSwitch; the next check confirmed no retained
display. The 30-second H.264 retry above completed and CivHomebrew management
reported idle terminal state. The user confirmed the picture. The later AV1
run confirmed that idle management state does not imply visible return: the last
image remains on the Switch after stop. The restart guard was preserved; another
native stream requires another process restart.

On the next fresh process the user confirmed moving content with sound on the
Sunshine PC. The AV1 motion run above established working native 1080p video and
audible audio without Boost or a PC relay. One-second steady samples ranged
roughly 52–60 FPS. Queue depths sampled between zero and three compressed
frames; mean measured decode latency including waiting was about 38 ms and the
maximum was 125 ms. Audio queued successfully, although the queue counters do
not establish glitch-free playback.

Retained presentation timing counters totalled 1,121 ms acquire, 1,460 ms submit,
1,661 ms present and 4,003 ms queue wait (about 3.27 ms per presented frame in
total). The full media-drain total was 25,857 ms; the cooperative core pump used
14,614 ms. These totals help target later profiling, but do not isolate a single
cause for the remaining frame-rate deficit. This is the measured baseline;
performance tuning still needs another fresh-process comparison.

Bounded read-only inspection showed the compatibility layer's close-request
flag cleared while its native-window state remained retained. The SDK exports
`nn::vi::SetLayerVisibility`, but its SDK-layer argument is a different layout
from this compatibility wrapper. No setter call with a guessed object, global
visibility change or forced Vulkan destruction was attempted. Visible exit and
safe resource reuse remain unresolved.

The initial native UI mapped Minus + Plus directly to stop, making the retained
image appear frozen. The first fix opened an NV12 Resume/Disconnect screen through the
existing renderer. The user confirmed that the native menu appeared and B
resumed the AV1 picture. Explicit Disconnect displayed the restart instruction;
the test completed with zero C tasks and no unfinished-stream marker. The full
browser regression also checks the held opener,
local-only input, presentation gating and explicit Disconnect. These changes add
no native exports, visibility setters or destruction calls.

A later diagnostic (`probe-experimental-owned-window.js`) ended without a
completion marker after its BEGIN log, and the user reported a game crash. Its
exact failing stage is unknown: setup, pattern publication and a window-ID
accessor were in the same probe. The probe is retired and was not repeated.
An exported symbol and matching entry bytes did not qualify that accessor's ABI.
The fix uses the established NV12 pipeline instead. Preserve this failure when
assessing future native-window experiments.

The main app update was initially refused while Hello CivSwitch was active.
After it closed, resident installation returned Invalid catalog entry, although
all listed entries and the exact new install plan/catalog passed an independent
in-memory console validation. The cause of that discrepancy was not established.
The documented `payload_menu.py install ... --via-loader` fallback ran only
while the raw receiver was idle and completed successfully. Readback verified
the main app manifest has 37 scripts and the native menu source matches its
stored checksum. The catalog retained Hello CivSwitch, Doom and the earlier test build.

Next qualifications: locked 60 FPS and longer gameplay with input/audio at
1080p without Boost; a packaged native-stream exit; 1080p120 streaming; docked 1440p/4K surfaces
and streams; overlays and safe resource reuse. Exported options remain
experimental until those workloads are measured.

## Cleanup and original-menu investigation, later 2026-11-10

`native-cleanup-features.txt` records 219 device extensions; neither EXT nor KHR
swapchain maintenance1/presentation fences is advertised. Surface capabilities
permit only opaque composition. The standard Vulkan reference explains that
queue idle alone does not prove presentation-engine completion; no missing
feature is silently enabled. The bounded driver-specific teardown completed,
which does not establish a general Vulkan teardown guarantee.

`native-display-cleanup.txt` records the first ordered display destruction;
`native-window-cleanup.txt` additionally records native-window connection zero
before VI close and layer state `0000` afterwards. The explicit disconnect call
was not needed and was not invoked. Both runs failed visible return, as confirmed
by the user. The display allocation was released by those diagnostics, which
are retired and must not be reused as recovery actions.

`native-content-restore.txt` contains only BEGIN, no completion. The user reported
a game crash. The probe used a checked SDK bool-only content-visibility setter;
matching export/entry bytes did not establish that this service path was safe in
the compatibility environment. It is retired and explicitly blocked in
`native-context.js`. Do not repeat it or substitute a guessed Layer object.
LayerWithHistory inspection found frame-history support; it did not establish
restoration of previous application content.

The original-menu adapter instead uses the already-created shader UI quad,
with 1920×1080 RGBA bytes in the third private frame slot. This fits the existing
slot/storage bounds and adds no native entry point. It hashes scene geometry,
styles and labels to avoid repainting unchanged controls. Main video NV12 is no
longer overwritten by menu painting. The original controller/dialog/keyboard/
mouse/touch state machines remain the source of menu behavior. A local browser
regression renders the exact native bitmap and checks held-chord gating, B,
More/keyboard, Logout confirmation and explicit Disconnect. The images
`native-original-menu-preview.png` and `native-original-keyboard-preview.png`
are browser QA, not console screenshots or device qualification.

### Native menu layout and latency qualification

The initial synthetic run completed (900 frames) but had no menu interaction.
A subsequent automatic-open run had DOM menu state `block` but uploaded no UI;
the user saw only the gray background. The actual DOM exposes nodeType,
getBoundingClientRect edges, children and computed styles. A further read-only
probe reproduced the problem: an absolute drawer under a fixed flex screen with
only insets measured 1280×0 while the screen itself measured 1280×720. Giving the
screen explicit viewport pixel dimensions made the same drawer measure 1280×720
and produced 29 scene commands. The stream screen now sizes itself explicitly
and unregisters its resize handler on destruction.

With that fix, the user confirmed the original drawer was visible but reported
about three seconds of input-to-image delay. The first upload itself took only
7 ms. Rasterization was optimized: uniform panel underlays compose once and use
typed-array fills; font blending reuses color/coverage lookup tables; clipped
ink does not enter the overlap ledger. A later console render measured 201 ms
for the whole initial UI update. User perception, keyboard/navigation costs and
real AV1 workload interaction are qualified separately, not implied by this one
number. The synthetic renderer remains owned/open between these diagnostics;
its live VI state was checked before reuse. This does not qualify reuse after a
real stream or after actual display destruction.

Later optimized navigation profiles separate layout, paint and upload. Repeated
drawer selection measured 21 ms; initial selection of a new description took
about 150 ms. Keyboard navigation after initial drawing measured 82–85 ms,
including about 54 ms gathering the previous UI renderer layout and 6–9 ms uploading/presenting.
A first keyboard paint can still take about 0.54 seconds. These are renderer
update timings, not end-to-end controller latency or AV1 throughput guarantees.
The UI now scans/renders on input, resize and statistics changes, plus one short
layout-settling recheck, rather than scanning an idle keyboard every 50 ms.
Caches are bounded (8 MiB/128 text patches). Small changed controls redraw only
the damaged regions; failed uploads force a full rebuild before reuse. Host
checks compare incremental and fresh full compositions byte for byte.

Current local validation: 155 unit tests, compiled-runtime checks, the full
browser UI regression, fresh main/Lab package inspection and the main package
smoke pass. Both packages contain 40 ordered scripts; the main package is
2,656,639 bytes at this checkpoint. The final native UI profile is in
`native-original-ui-final-profile-console.txt`. Main-app installation and a real
AV1 stream with the restored drawer are the remaining interactive checks.

## Rendering handoff investigation, 2026-11-11

Restart-free return remains unresolved. The original game NVN window and VI
layer were located by captured native callers and validated device/native-handle
identity. Its acquire/present bookkeeping continues after the independent native
layer closes. the previous UI renderer's black output therefore does not establish that its
renderer or DOM stopped. A teardown retaining the Vulkan device and default
Display reference still left black, ruling out their destruction as the initial
cause in that run. The default Display Open/Close helpers are reference counted.

The detailed [GS finding ledger](../investigation/gs-presentation-findings.md)
records the version-bound paths, source-derived GS list layout, exact native
calls, ownership boundaries and incomplete hypotheses. Reapplying original NVN
interval/buffer settings did not restore output. Direct original GS selection
returned Result 626; a named-binding clear succeeded but subsequent original
selection also returned 626. Its remote meaning is unknown.

Using a distinct native layer name crashed during setup, without a completion
marker or exact failing call. That route is retired. A temporary GS connected
state on the original logical layer registered successfully; its initially
unselected state triggered an overly strict guard. Rollback finished with all
recorded allocations released, original owner/list/selection preserved and no
quarantine. A later setup attempt in the same process crashed before the next
connection marker. Full teardown is not evidence that GPU/context recreation is
safe; the precise failing call and cause were not localized.

A separate GS-only test created no Vulkan device. Selecting the owned registered
state through the checked backend hook returned Result 0, and the logical cache
was mirrored under its native mutex. The following two-second JavaScript timer
never reached cleanup. The user still saw the blue baseline image; the management
status request did not respond promptly. This establishes an accepted native
selection, not a visible mode switch or return. Do not repeat this empty-output
selection probe. A future handoff must qualify buffered presentation before
selection/yield and restore buffered original output before destroying the owned
presentation resources. Both requirements remain proposals, not console proof.

No experimental recovery call or distinct-name path from this investigation was
added to the packaged app. Manifest paths/order remain unchanged; fresh package
build and inspection pass with 40 scripts. No C/build-configuration change was
made during this handoff investigation, so no rebuild was required for these
probe-only changes. The previously installed app still has the documented restart
boundary until a working handoff is qualified and integrated.
