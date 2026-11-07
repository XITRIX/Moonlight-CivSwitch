# Reference projects

These projects support investigation and are not used to build the app payload.

## CivSwitch

The existing checkout was moved intact to `CivSwitch/`, including its own Git
metadata and installed dependencies. It is ignored by the parent repository so
it cannot accidentally be added as an unconfigured embedded Git repository.

- Upstream: [Gezine/CivSwitch](https://github.com/Gezine/CivSwitch)
- Local revision: `59e27b4894e91bc53ece58dd5e9add7335639ef3`

To recreate the checkout from the repository root:

```sh
git clone https://github.com/Gezine/CivSwitch.git investigation/references/CivSwitch
git -C investigation/references/CivSwitch checkout 59e27b4894e91bc53ece58dd5e9add7335639ef3
```

## nxhid-civswitch-auto

The supplied reference bundle is preserved in `nxhid-civswitch-auto/`. Its build
information, test results, patch, source, licenses, and Switch binaries remain
together. See its `BUILD-INFO.txt` and `CIVSWITCH-AUTO.md` for provenance and usage.

## moonlight-common-c and Mbed TLS

`moonlight-common-c/` is an unmodified clone with its ENet and nanors submodules.
`mbedtls/` supplies real crypto for the wasm2js experiment. These local checkouts
are ignored by the parent repository. Exact revisions are recorded in
[sources.lock.json](../wasm2js/sources.lock.json); recreate them using
`python3 -B investigation/wasm2js/bootstrap.py` from the repository root.
