# GS presentation switching findings

Status: investigation, 2026-11-11. These findings do not establish a working
restart-free switch. Native captures are specific to nnCompat hash `cf649bbd`.
All offsets below are relative to that module unless explicitly marked `main`.

## Observed display failure

The Gameface blue baseline was visible before creating Moonlight's independent
native display. After destroying the owned semaphores, swapchain, surface and VI
layer, Gameface remained black. Owned VI lifecycle flags were `0000`.

This occurred while retaining the owned Vulkan instance, device and command pool,
and the extra default-display reference. The default reference count was 1 before
creation, 2 after creation and still 2 after this partial teardown. Closing the
shared display or destroying the Vulkan device therefore cannot explain the
initial loss of Gameface in this run.

Fresh samples of the original NVN window show its buffer bookkeeping continuing
to cycle through 0, 1 and 2 after teardown. This supports continued original game
rendering; it is not proof that the compositor is displaying those buffers.

## Proven original object paths

| Object or field | Path |
| --- | --- |
| Default VI display singleton | nnCompat + `0x5bd8018` |
| Original legacy VI Layer singleton | nnCompat + `0x5456558` |
| Original connected GS state | original VI Layer + `0x8` |
| Original logical GS Layer | original VI Layer + `0x408` |
| Original logical display-name key | original VI Layer + `0x418` |
| Original logical layer-name key | original VI Layer + `0x420` |
| Original cached selected GS state | original VI Layer + `0x438` |
| Original native-window handle | original VI Layer + `0x4b0` |
| Original NVN window | main + `81563128` |

The original NVN window was matched using its device and native handle, dimensions
1280×720, and three textures. Its interval 0→1→0 and active-texture count reset to
3 completed without a crash but did not restore the picture.

The original logical display and layer keys both contain
`64656661756c7400`, meaning `default`. The selected state equals VI Layer + 8,
and that state's owner at +`0x10` equals the original logical GS Layer.

## Creation settings do not control this path

The creation-settings structure stores width at +0, height at +4 and flags at +8.
Flag bit 0 means fullscreen; bit 1 means visible. The default constructor creates
1920×1080 settings with flags 2: visible, not fullscreen.

`Layer::Open` at 2478608 reads only the width and height. It never reads the flag
word or calls the fullscreen/visibility getters. Its virtual `OnOpen` receives
the Display and label, without the settings object. These settings flags cannot
control GS activation through this implementation's captured call chain.

## Logical layers and backend selection

`Layer::OnOpen` at 2479616 reaches `InternalLayer::Initialize` at 2470176. That
initializes a logical GS Layer at InternalLayer + `0x400` through GS CreateLayer
2445632, then connects the InternalLayer root through GS Connect 2446112.

GS CreateLayer initializes this layout:

| Logical Layer offset | Meaning established by captured instructions |
| --- | --- |
| +`0x08` | GS interface object |
| +`0x10` | Encoded display-name key copied from Display + `0x10` |
| +`0x18` | Encoded layer-name key |
| +`0x20`, +`0x28` | Connected-state list head |
| +`0x30` | Cached selected connected state |
| +`0x38` | Display owner |
| +`0x40`, +`0x48` | Display's logical-layer list link |

The name wrapper at 2419280 packs the first eight bytes into a little-endian
64-bit key, stopping at NUL. Longer names are truncated, not rejected. Its local
code does not whitelist `default`; remote service acceptance of other names is
unknown.

GS Connect's helper at 2446624 reserves two slots from a shared bitmap, then calls
the backend's +`0x108` hook with the connected state and slot IDs. Its captured
body does not implement a single global current-window pointer.

Attach at 2447360 registers the connected state through backend +`0xf8`, links it
into the logical Layer's list, and compares the list's last state to the cached
selection. When changed, it calls backend +`0xd0` with display key, layer key and
state; when the list becomes empty, it calls +`0xd8` with the two keys.

Detach at 2447648 first unregisters the connected state through backend +`0x100`,
then recomputes the named selection through +`0xd0` or +`0xd8`. Thus the named
binding clear is a separate operation from connected-state unregistration.

| Backend hook | Function offset | Captured request | Arguments after context |
| --- | --- | --- | --- |
| +`0xd0` | 2427264 | command 127 | display key, layer key, state |
| +`0xd8` | 2427472 | command 128 | display key, layer key |
| +`0xf8` | 2428304 | command 267 | state, display key |
| +`0x100` | 2428512 | command 268 | state |

The backend table is nnCompat + 67428016. Context is read from table +`0x18`.
These wrappers lock their context, marshal synchronous requests, validate the
reply, unlock and return a 32-bit Result. The four-register ABI for command 127
is established by the captured caller and callee; there is no hidden output
pointer. The wrappers alone cannot establish remote service semantics.

## Name-collision hypothesis and failed recovery probes

Moonlight's current `display.js` uses `LAYER_NAME = 'default\0'`, matching the
original layer key. Separate logical layers maintain separate cached selections.
If the service routes presentation by the shared display/layer key, creating a
second `default` layer could disturb the original binding without invalidating
the original client's cached selection. This is a hypothesis, not a confirmed
root cause.

Two bounded, guarded probes have now failed to recover presentation:

1. Calling command 127 once with the exact original context, keys and state
   returned Result 626 (`0x272`), without crashing.
2. A paired command 128 clear followed by command 127 returned clear Result 0,
   then assign Result 626, without crashing.

**The remote meaning of Result 626 is unknown.** Local GS routines also use this
value for already-owned objects, but that does not identify the service's error.
It must not be described as proven "already selected", invalid registration, or
an invalid connection. The failed pair weakens the simple missing-binding
explanation. Do not repeat it without new evidence.

Evidence: [backend and original state](evidence/gs-backend-selection.txt),
[logical attach/detach and active window samples](evidence/gs-activation-helpers.txt),
[first assign result](evidence/reselect-original-layer.txt),
[paired clear/assign result](evidence/rebind-original-layer.txt),
[creation settings](evidence/layer-settings-code.txt).

## Distinct-name test failed

A fresh-process probe changed the known `default` label write to `mlvideo` and
attempted the existing 1920×1080 synthetic display pattern with full teardown.
The user reported a game crash. The capture ends after
`MOONLIGHT_UNIQUE_LAYER_STAGE` with stage `display`; it contains no successful
display-open, pattern, cleanup, error or completion record. The exact native call
that crashed is not established by this capture. This does not prove that every
nondefault name is unsupported, but another custom-name device test is not
justified without better static evidence.

Evidence: [probe](probes/probe-unique-layer-return.js) and
[last captured stage](evidence/unique-layer-return.txt).

## Next candidate: borrow the original logical GS Layer

The captured GS list implementation supports multiple connected states attached
to one logical Layer. A narrower candidate is to construct an owned VI Layer's
storage, connect its owned InternalLayer state to the existing original logical
GS Layer, and initialize its owned NativeWindow. This avoids creating a second
named logical layer altogether. Registration and selection have now been partly
tested as described below; the complete shared-state WSI path remains unqualified.

The candidate call sequence established by the captured implementations is:

1. Construct the owned Layer with constructor 2478496.
2. Call GS Connect wrapper 2419472 with `(ownedLayer + 8, originalLogicalLayer)`.
   This registers an independent state and appends it to the borrowed logical
   Layer's list; that list's selection policy is described above.
3. Reproduce base OnOpen's `SetNextUserData(ownedInternal, 4, 0)` and
   `NativeWindow::Initialize` at 2473712 with
   `(ownedLayer + 0x4a8, ownedLayer + 8)`.
4. Set the owned native-window dimensions through qualified
   `LayerNativeWindow::SetBufferSize` at 2475008, reached through Layer.Open's PLT
   45954800 (`0x2bd36f0`). It writes width and height as uint16 values at native
   window +`0x30` and +`0x32`. The earlier suggested +`0x28` offset was incorrect.

The Layer constructor already initializes the listener at +`0x498`, NativeWindow
at +`0x4a8`, lifecycle flags +`0x500`/+`0x501`, callback slots and the crop reset
that normally follows InternalLayer.Initialize. Keep its VI lifecycle flags zero
unless evidence requires otherwise. The NativeWindow disconnect listener returns
when +`0x501` is not 1; this prevents an automatic virtual OnClose from entering a
finalizer that assumes ownership of a logical layer.

Once any selected lease has handed presentation back to the original state,
cleanup destroys owned WSI, then finalizes only the owned NativeWindow
at 2474160 and disconnects the owned GS state through wrapper 2419504. The latter
unlinks that state and should promote the original list entry through the normal
GS detach policy. Never call `Layer::Close`, `Layer::OnClose` or
`InternalLayer::Finalize` on this synthetic Layer: their normal cleanup also
finalizes the logical layer at owned InternalLayer +`0x400`, which this candidate
does not initialize or own. Never finalize the borrowed original logical Layer,
original connected state or original NVN window.

Evidence for setup qualification:
[captured helpers and original baseline](evidence/shared-layer-setup.txt).

## Shared-state registration and subsequent setup crash

The first shared-state probe returned Result 0 from GS Connect, then stopped at
the probe's assertion that the owned state must immediately be selected. This
assertion was too strong: insertion leaves the existing original entry at the
selected end of the list. Original selection remains unchanged after dormant
registration. No NativeWindow initialization or WSI setup occurred after that
guard. Rollback disconnected the owned state, closed the complete GPU ledger and
released allocations. The following read-only check found the ledger closed,
without quarantine, and original owner/selection preserved.

The next attempt in the same process corrected this guard. The user reported a
game crash. Its log stops at the display-creation stage, before
`MOONLIGHT_SHARED_LAYER_CONNECT_BEGIN`. That marker follows the intercepted
Open's JavaScript preflight. This does not uniquely identify the native call that
crashed, or prove that Vulkan global initialization caused it. However, complete
GPU/private-native-context destruction followed by recreation is now an
unqualified, suspected variable. Do not repeat this setup in the same process.

Evidence: [first guarded result](evidence/shared-layer-return.txt),
[verified rollback](evidence/shared-layer-activation.txt), and
[next attempt's last stage](evidence/shared-layer-return-dormant.txt).

`ConnectByNativeWindow` at 2470448 reaches GS 2455552 through wrapper 2419664 and
table slot +`0x98`. It only stores attributes at state +`0x2b8` and sets connected
at +`0x2c0`. Disconnect at 2470464 reaches GS 2455600 through wrapper 2419696 and
slot +`0xa0`; it clears those flags. Neither operation promotes a logical list
entry. Exact PresentBuffer is 2470656 → 2419632 → GS slot +`0x80` → 2451648.
Its captured body submits buffers but shows no direct logical-list promotion.

Evidence: [native connection flags](evidence/native-window-activation.txt) and
[frame presentation](evidence/gs-frame-presentation.txt).

## GS-only selection accepted, then execution stopped progressing

The GS-only lease probe created no Vulkan instance, device, surface or swapchain.
It constructed an owned state on the borrowed logical Layer, initialized its
NativeWindow and dimensions, and called backend command 127 under the logical
mutex with the newly registered owned state. Only after Result 0 did it mirror
that selection into logical +`0x30`. The selection call and unlock returned far
enough for the following log record to appear:

```text
MOONLIGHT_GS_LEASE_CONNECT {"result":0}
MOONLIGHT_GS_LEASE_SELECT_BEGIN
MOONLIGHT_GS_LEASE_SELECTED {"result":0,"cacheMirrored":true}
```

The probe then awaited a two-second JavaScript timer before cleanup. No
`MOONLIGHT_GS_LEASE_DETACH_BEGIN`, restoration or completion record followed before
the sender's 45-second deadline. A subsequent status check did not respond. The
user still saw the blue Gameface baseline and did not report a crash for this run.
Owned teardown and visible return have not been established; do not free the
uncertain backing state or describe this as a successful switch.

This is stronger evidence that the service accepts selection of a newly
registered owned state: command 127 returned 0 for that state, unlike the earlier
original-state recovery attempts that returned 626. It does not prove that the
owned state became visible or that the original can be restored.

Selecting a state with no submitted image may block presentation progress or the
original renderer/Gameface event loop. This is a hypothesis; the precise blocked
thread and operation are unknown. The GS-only select → await → detach probe is
retired. Do not repeat it or rely on a JavaScript timer to recover from selecting
an unbuffered state.

Evidence: [probe](probes/probe-gs-selection-lease.js),
[last execution records](evidence/gs-selection-lease.txt), and
[qualified mutex implementation](evidence/gs-mutex-bodies.txt).

## Retain the GPU context for the next qualification

The next experiment requires a fresh process and must create one Vulkan instance,
device, queue, display command pool and command buffer only once. Retain the same
native context and private ABI stack as well. A presentation lease may destroy its
renderer resources, WSI, owned native window and GS state, but must retain these
process owners. First qualify one create → pattern → presentation teardown cycle;
do not immediately repeat complete context creation/destruction in a loop.

Before selecting the owned state, create its live WSI and establish a buffer ready
for presentation. Selection and the first owned presentation must complete before
yielding to JavaScript timers or asynchronous stage reporting. A buffered handoff
is a proposed correction, not a proven cure for the observed stall.

The reverse handoff also needs qualification while owned WSI is still alive:
select the original registered, buffered state under the logical mutex, and mirror
the cache only on Result 0, before asynchronous owned teardown starts. Destroying
selected owned WSI and then awaiting a cleanup report could recreate an empty
selected state. Never assume an automatic Detach cache update proves remote
restoration. A failed reverse handoff must retain owned WSI and backing objects;
restart-free disconnect cannot ship until the reverse handoff and visible return
are demonstrated.

`display.js::createDisplay` currently zeros its output block and unconditionally
calls private `deviceSteps` before presentation setup. Merely prepopulating handles
does not bypass this. A clean design would accept a retained GPU context, skip
`deviceSteps`, and seed these 64-bit output slots:

| Output offset | Retained handle |
| --- | --- |
| 0 | instance |
| 16 | physical device |
| 32 | logical device |
| 40 | queue |
| 72 | command pool |
| 80 | command buffer |

The presentation stage initializes its own remaining create-info structures.
Process GPU objects must be excluded from the lease's destruction list, including
on partial failure. Renderer command pools are separate lease owners and remain
eligible for destruction after queue idle. `keepContext: true` only prevents
`context.close`; it does not retain objects or allocations recorded in the cleanup
ledger. Store retained ownership explicitly and quarantine uncertain owners.

A probe-only native-call shim could populate these outputs instead of reissuing
the creation calls, but its synthetic success records must also be removed from
the lease's owned GPU records. An explicit API split is easier to audit. Neither
design is a production change in this investigation document.

Instrument native-call BEGIN/END markers in the fresh-process run so another
failure can be localized. No successful native-to-Gameface switch has yet been
established.

The no-Boost 1080p goal remains unchanged. Process context retention does not itself
change rendering dimensions or add a PC companion requirement.

## Retired unsafe paths

Do not repeat the SDK global content-visibility setter, guessed SDK Layer
visibility calls with nnCompat objects, or the earlier combined native-window-ID
accessor probe. Those paths crashed or used incompatible object layouts. No
original NVN window destruction or reinitialization has been justified.

This document changes no packaged runtime script, dependency or execution order.
Native captures were decoded with Apple LLVM; no native REA target was opened for
this analysis.
