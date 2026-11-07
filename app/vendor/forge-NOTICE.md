node-forge 1.4.3, Digital Bazaar, Inc.

Source: https://github.com/digitalbazaar/forge/tree/v1.4.3
Package: https://registry.npmjs.org/node-forge/-/node-forge-1.4.3.tgz
Upstream npm SHA-1: 5dc578529ac8e162f58038c6673337cabfab3277
License: BSD-3-Clause (the applicable full text is in forge-LICENSE;
upstream's file also includes its alternative GPL license).

The browser build `dist/forge.min.js` is vendored with these changes:
all three `Math.random()` calls are replaced with
`window.MoonlightForgeRandom()`, and the source-map comment is removed.
This prevents weak random fallbacks, including Miller–Rabin witnesses.
sunshine-pairing.js installs that hook using the caller's native secure RNG,
and overrides forge.random.getBytes/getBytesSync for all cryptographic use.
No network CDN, npm installation, or Mac crypto helper is required at runtime.

The optional URL-based console logging settings are guarded when `URL` or its
`searchParams.has/get` methods are unavailable. Civ VII exposes a partial URL
implementation; absence of optional logging settings must not prevent loading.

Time-limited RSA key-generation steps (`n > 0`) also stop after eight state
operations, even if the embedded browser's Date clock does not advance within
a callback. The candidate wheel's delta index is retained between steps. The
synchronous `n <= 0` behavior is unchanged. Miller–Rabin witness selection fails
closed after 128 rejected random witnesses instead of potentially looping
forever with a broken entropy source. These changes preserve the requested
2048-bit key size and upstream primality-test count.

Forge's TLS implementation is NOT used. The caller must supply native TLS
with the client certificate and exact server-certificate pin verification.
