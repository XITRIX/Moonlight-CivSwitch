# Executing moonlight-common-c through wasm2js

2026-11-07, same user's Civ VII/CivSwitch installation as the earlier streaming
investigation. No Switch files were written; the app and saved pairing were not changed.

## Build

Pinned upstream `moonlight-common-c` revision
`e80a786afedeaccff63e839e68c8f3d8a057c13d`, with its exact ENet and nanors
submodules. Crypto dependency: Mbed TLS 3.6.4. Compiler: Emscripten 3.1.74,
`-sWASM=0 -sSINGLE_FILE=1`. No upstream source modifications.

The generated **740,701-byte** JS library exports all **54 public Li APIs**, plus
memory/FFI helpers and diagnostics. Tested artifact SHA-256:
`ff54c9387058805351cb2e50f4dcc71ce74863d901a2c2b2d2e3043cb96123e0`.

Sources: [pinned revisions](../../third_party/sources.lock.json),
[build instructions](../../tools/wasm2js/README.md), [build log](wasm2js-build.txt).

## Execution evidence

The local browser-like Node VM explicitly sets `WebAssembly`, `Worker` and
`SharedWorker` to undefined and disables Wasm code generation. All API export
checks and the algorithm checks below passed. Missing entropy fails closed.
[Local log](wasm2js-local-tests.txt).

The exact generated library was then uploaded into the Switch's memory in five
loader payloads, evaluated, instantiated and called. The environment still
reported `WebAssembly` and `Worker` as `undefined`.
[Console transcript](wasm2js-console-tests.txt).

| Check | Actual execution on Switch |
| --- | --- |
| Library initialization | Success, 90 ms; 54 public Li exports |
| Upstream RTSP parser/serializer | Response/session/payload parsed and round-tripped; malformed input rejected; 9 ms |
| Actual nanors FEC | Three 1,024-byte data shards plus two parity shards; two erased data shards reconstructed exactly; 31 ms |
| Upstream crypto with Mbed TLS | Known AES-128-GCM ciphertext/tag matched, decrypt matched, replay rejected, tampered tag rejected; 34 ms |
| Secure entropy adapter | Native SDK secure RNG filled module memory; 62 distinct byte values in 64 bytes; no secret bytes logged |
| Stock thread backend | Returned EAGAIN (6), correctly indicating unavailable threads |

Times are single first-call wall-clock measurements and include initialization.
They are not steady-state packet-rate or encryption-throughput benchmarks. The
entropy check verifies adapter execution; the small uniqueness check is not a
cryptographic randomness certification.

## Interpretation

**The C-to-JavaScript reuse route works on this Switch.** It does not require the
disabled Wasm engine or new ARM64 code execution. It also does not supply Workers,
native sockets, decoder/presentation callbacks or a scheduler automatically.

No full Sunshine streaming session was attempted by this test. The stock
thread backend is unusable for the core's concurrent loops, and Emscripten's
current socket backend uses WebSockets rather than the needed native UDP.
Those platform implementations must be adapted before calling the core a usable
streaming client. Protocol algorithms do not need to be rewritten merely because
the generated runtime needs those adapters.
