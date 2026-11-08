# Switch OLED video backend — 2026-11-08

Target: user's Switch OLED at 192.168.1.148:9026, reported Civ VII 1.0.0,
720p60. The user confirmed that the current app still streams on Switch 2.

The OLED first reported `Stream stage 9 failed: -1`. Stage 9 is video startup.
Preserving the original native callback exception revealed
`Native movie module unavailable`, thrown by `native-media.js:findMovie()` before
decoder construction. This is not evidence of a 720p60 performance limit.

## Observations

- [Discovery capture](oled-movie-discovery.txt): a complete 39-bit mapping walk
  visited 149 regions and found five executable mappings. It inspected main,
  SDK and the other MOD0 modules. None exported either checked `movie::Decoder`
  constructor, `Configure`, `Start`, or `GetThreadPriority`.
- The discovery probe used 323 memory queries and completed with the loader's
  `Executed successfully` marker. No movie functions were invoked.
- [Export inventory](oled-decoder-exports.txt): a second complete walk visited
  147 regions and the same five executable module bases. Counts were 34,774
  main symbols, 23,046 SDK symbols, 2,044 UI media symbols, 52 symbols in another
  module, and three loader symbols. The differing region counts do not change
  the executable module inventory.
- That inventory found libvpx VP8/VP9 exports in the UI media module. SDK movie
  matches concern recording/album APIs and multimedia reporting; no exported
  `movie::Decoder` or matching H.264 decoder interface was found. Generic module
  loading functions are exported, but were not called. Export presence does not
  establish a usable or compatible decoder/library-loading path.
- In the earlier [Switch 2 inventory](streaming-modules.txt), there were seven
  executable mappings, including a separate module with 4,241 symbols and
  109,625 string bytes that exported the movie decoder used by the app. That
  module is absent from this OLED process's executable module inventory.

## Conclusion and limits

The current app depends on a native movie interface available in the recorded
Switch 2 process and unavailable in this OLED process. Neither the app's
512-region search cap nor its symbol/string limits explain this OLED result.
Changing streaming resolution does not supply the missing interface.

This is a bounded negative search of loaded modules and their dynamic symbols.
It does not prove that OLED hardware cannot decode H.264, that no private decoder
exists, or that a suitable module cannot be loaded later. The origin of the
extra Switch 2 module is not established by these captures.

OLED streaming remains unsupported by the current video backend. Further work
must establish a compatible loadable decoder or another native decoding path,
then verify its ABI, texture transfer, ownership and actual output. No decoder
or service initialization, module loading, filesystem mutation or app upload
was performed during these two probes.

Reproduce the first probe using [the probe instructions](../probes/STREAMING.md).
The follow-up is standalone as well:

```sh
python3 investigation/probes/send-probe.py 192.168.1.148 \
  investigation/probes/inspect-streaming-decoder-exports.js \
  --output investigation/evidence/oled-decoder-exports-rerun.txt
```

Only run a follow-up after the previous payload's completion marker and while
the loader is idle. The export search is name-based, not disassembly or a
decoder execution test.
