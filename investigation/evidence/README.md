# Hardware findings — 2026-11-07

Target: user's Switch 2, Civ VII/CivSwitch loader at 192.168.1.182:9026.
Sunshine: 192.168.1.4:47989, advertised HTTPS port47984.

Streaming investigation: start with [the feasibility ledger](streaming-feasibility.md)
for measured Wasm, video, audio, networking, execution limits and linked probe logs.
The later [wasm2js build and hardware test](wasm2js.md) establishes execution of
the actual C core's algorithms as ordinary JS without enabling WebAssembly.
The [direct-rendering ledger](direct-rendering.md) records the implemented
native texture presenter, generated-image hardware checks, and real host runs
and the later native GPU decoder path at about 30 presented fps at 720p.
[Live session evidence](streaming-live.md) tracks
video/audio results and their remaining limitations.

- `network-capabilities.txt`: actual JavaScript capability inventory; XHR external
  request returned404. WebSocket exists but external connectivity was not tested.
- `native-network.txt`: direct native TCP GET returnedHTTP200/serverinfo. SDK
  export inspection found native SSL, clientPKI import, nonblocking mode,
  secureRNG, SHA256, and AES functions. Export presence alone is not execution.
- `rng-clock.txt`: bounded runtime probe established that Date advances inside a
  callback and nativeRNG returns varied bytes quickly. No keys/secret bytes logged.

Separate probes successfully created a TLS1.2 context/connection, assigned a
socket/hostname/certificate buffer, and selected nonblocking I/O. Handshake
returned retry0x1987b then error0x19e7b; this did not establish a successful TLS
session. An unauthenticated self-signed host was being tested. The exact failure
reason was not independently decoded.

The SDK TLS wrapper code was read from the running process and inspected to
confirm object size and argument order. REA accepted the synthetic ELF containing
that bounded code slice, but its Hopper assembly provider rejected requests;
a temporary Capstone installation was used for disassembly. No complete game
binary or private state was extracted.

The first live UI reached Sunshine online and then became unresponsive during
identity generation. A later bounded diagnostic showed multi-second Forge RSA
steps with very little time spent obtaining entropy. This motivated accelerating
modular arithmetic and retaining hard per-step/rejection limits.

Pairing and persistence results must be recorded separately after actual PIN,
mutualTLS, write/readback, and reload tests. Protocol unit tests do not establish
these on-device facts.

`identity-bigint.txt`: on-console RSA2048 generation completed in1997ms after
modular arithmetic was moved to BigInt. Certificate signing, PKCS#12 creation,
identity save/commit/readback completed. The diagnostic deliberately stopped at
`waiting_pin` before sending the first `/pair` request. This establishes identity
persistence, not successful Sunshine pairing.

`tls-client-certificate.txt`: a focused native HTTPS diagnostic reloaded the
persisted client identity, imported its PKCS#12, verified the exact host leaf
certificate, and obtained HTTP200 with `PairStatus=1`. For this isolated test,
the public host certificate was read on the Mac and embedded in the diagnostic;
it was not saved as an authenticated pairing pin. Production pairing obtains
and authenticates the pin through the console's PIN challenge exchange. The
initial full-flow TLS failure and later diagnostic success suggest a transient
post-pairing handshake issue; bounded retries retain all verification checks.

`pairing-success.txt`: the complete UI flow succeeded after the next manual PIN
approval. It used the console's PIN-authenticated server certificate, native TLS
with the stored client identity, HTTPS pairchallenge and `PairStatus=1`, then
committed/read back the successful host record. The user also reported
“Paired successfully.” The temporary PIN is omitted from this saved transcript.

A second Connect reloaded the saved pairing and returned
`MOONLIGHT_PAIRING_SAVED: reused`, without entering the PIN stage. This verifies
on-device file persistence and authenticated reuse between connection attempts.
A complete game restart/reboot persistence test has not been performed.

Current storage: all experiment-owned Switch files live in
`save:/moonlight-experiment/`. The identity and paired host were verified by
reloading the saved data and obtaining authenticated native HTTPS `PairStatus=1`.
Native reads/writes reject paths outside this directory. Local cleanup removes
only this directory; it has not been executed on the real identity, which is
intentionally preserved. Filesystem tests cover interrupted writes, recovery,
and cleanup scope.


Application list: the Switch fetched `/applist` over pinned native TLS and parsed
three entries: Desktop (881448767), Steam Big Picture (1093255277), and Virtual
Display (382300562). DOMParser was confirmed absent. Browser UI tests use a
separate ten-entry library to check the portrait grid at 720p and 1080p, four-way
keyboard/engine/gamepad navigation, paging and partial rows, horizontal footer
controls, literal rendering of markup-like titles, empty/error responses, refresh,
B cancellation, late responses, reconnect, and close.
`games-screen-preview.png` depicts the three example host entries using the fake
browser host, generated test PNG covers, and the current dark card style. These
fixture covers are not images downloaded from the real host.
The user then verified the dedicated screen on the real Switch: the list,
portrait grid, four-way D-pad navigation, horizontal footer controls, and B back
all work. Browser tests also cover lazy PNG loading, download/decode failures,
and cancellation. All three real host covers subsequently loaded and fired image
display events on the Switch; the user verified immediate cache reuse.

`image-loader.txt`: a read-only console probe confirms PNG data URLs and image
load events work for visible and hidden elements. The first real host cover was
downloaded through pinned TLS (Desktop, 8231 bytes). The user reported repeated
slow loads, so the cache now survives Refresh and returning to Host for the same
host; browser checks assert that both requests and image elements are reused.

Persistent artwork cache (2026-11-08): closing the UI previously discarded all
cached covers, causing another download on the next load. The app now stores
checked PNG bytes and an index inside `save:/moonlight-experiment/artwork/`,
with a 16 MiB limit. `artwork-persistence-warm.txt` records all three real covers
downloaded and saved (131,742 bytes total). `artwork-persistence-cold.txt` records
fresh modules and a new native transport/store loading all three from disk:
three cache hits, zero `/appasset` requests, no cache errors, and successful
loader completion. Reads took 67, 178, and 684 ms respectively.

`artwork-write-diagnostic.txt` locates an earlier native disconnect at CreateFile
with a 68-character filename. `artwork-write-short-filename.txt` confirms that
60-character filenames allow binary writes, readback, index writes, and commit
to complete successfully. The isolated fixture was subsequently removed
(`artwork-fixture-cleanup.txt`). Cache filenames now use 56 hex characters plus
`.png`; full SHA-256 keys and byte digests remain in the index. Local cache tests
exercise reloads, corrupt/missing PNGs, quota eviction, invalid indexes, and failed
writes. `artwork-persistence-ui-tests.txt` records browser regression results.
The updated streaming UI was then loaded (`artwork-persistence-ui.txt`); its
`MOONLIGHT_ARTWORK_CACHED` events confirm the Games screen uses the disk cache.

Stream settings (2026-11-08): `settings-local-tests.txt` records all 23 local
tests passing, including mode validation, persistence across store instances,
corrupt preferences, and write/commit/readback failures. `settings-ui-tests.txt`
checks controller/keyboard navigation, Host and Games entry points, save errors,
return navigation with cover reuse, and the chosen mode reaching the stream
client. `settings-screen-preview.png` shows the separate screen at 1280×720.
`settings-persistence-switch.txt` verifies native write/commit/reload of
960×540, 60 FPS, 8000 kbit/s using a new native transport, then restores the prior
720p/30 FPS/5000 kbit/s mode. Only the experiment's `settings.json` was written.
