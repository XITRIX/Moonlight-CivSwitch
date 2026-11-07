# Hardware findings — 2026-11-07

Target: user's Switch 2, Civ VII/CivSwitch loader at 192.168.1.182:9026.
Sunshine: 192.168.1.4:47989, advertised HTTPS port47984.

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
separate fake eight-entry library to check 720p layout, paging, literal rendering
of markup-like titles, empty/error responses, refresh, B cancellation, late
responses, reconnect, and close. `games-screen-preview.png` depicts that fixture.
The user then verified the dedicated screen on the real Switch: the list,
D-pad navigation, and B back all work.
