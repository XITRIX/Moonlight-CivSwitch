# Generated runtime checks

These checks exercise the actual generated C-to-JavaScript runtime on the host.
They require Node 22+, Python 3, pinned dependency sources, and a completed build:

```sh
npm run bootstrap
npm run build
npm run test:runtime
```

- `test-core.cjs`: upstream API exports, RTSP, FEC, cryptography, secure entropy,
  and execution with WebAssembly and Workers unavailable.
- `test-runtime.cjs`: optimized streaming algorithms, compiler-transform
  semantics, cooperative scheduling, cancellation, input wake and PNG bounds.
- `test-direct-receive.cjs`: packet-buffer ownership across fiber suspension,
  partial batches, errors and fallback.
- `test-session-routing.cjs`: LAN/WAN socket destinations with host-advertised
  LAN RTSP URLs, plain/encrypted negotiation and automatic Internet packet sizing.
- `test-wasm2js-specialization.py`: guarded compiler/source transformations,
  including rejection of unexpected source and generated-code shapes.
- `native/`: C fixtures and the fiber proof built by the runtime CMake targets.

Artifacts are read from `dist/runtime/`; symbol maps are read from
`build/wasm2js/`. The diagnostic exports remain included in the runtime as before
the folder reorganization. The default `npm test` runs the JavaScript app tests
without requiring these generated artifacts.

Hardware probes and their upload scripts live under `investigation/probes/`;
captured results stay under `investigation/evidence/`.
