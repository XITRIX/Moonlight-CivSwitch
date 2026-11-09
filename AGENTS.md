# Moonlight development routine

Use the `civswitch-development` skill for CivSwitch runtime, UI, native bridge,
streaming and device-testing work.

## Mandatory packaging maintenance

Treat `payload.json` as part of the Moonlight application, alongside its sources.
For every Moonlight development task:

1. Review whether the change affects packaged files, dependencies or execution
   order. When adding, moving, renaming or removing a runtime script, update
   `payload.json` and `tools/send_ui.py`'s `APP_SCRIPTS` in the same change.
   Preserve dependency order and keep `app/src/ui/moonlight-ui.js` last so its
   lifetime promise remains the bundle's completion value. Keep packaging-only
   notices, the generated runtime and its adapter before the shared app scripts.
2. Check that every manifest path exists and that the package includes all
   required runtime dependencies. Rebuild `dist/runtime/moonlight-stream.js`
   with `npm run build` when native sources or build configuration change, or
   when the generated runtime is missing or stale. Refresh bundled notices when
   dependencies or their licenses change.
3. Before handing off completed work or beginning a Switch test, build and
   validate a fresh package from the repository root:

   ```sh
   python3 tools/package_payload.py --directory . \
     --non-interactive -o dist/moonlight.civapp
   python3 tools/package_payload.py --inspect dist/moonlight.civapp
   ```

4. Run checks appropriate to the change. When changing packaging, script order,
   the runtime adapter or app lifecycle, also run:

   ```sh
   npm run test:package
   ```

The packager reuses the saved paths; it does not discover dependencies or update
the manifest automatically. Do not treat an older successful package as proof
that the current sources can be bundled. Report any unavailable build/tooling
checks explicitly. Keep local/browser verification distinct from console tests;
this routine does not require automatically deploying or launching on a device.
