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
