# HEVC decoder investigation — 2026-11-08

Target: the installed Civ VII 1.0.0 movie implementation, running through
CivSwitch on the user's Switch 2 at `192.168.1.182:9026`.

## Result

**No HEVC decoder is exposed by the movie API used by this app.** Keep H.264
as the stream format; no nonfunctional codec setting was added. This finding
does not establish that Switch 2 hardware or a different system API lacks HEVC.
It establishes the limits of this installed movie implementation and our
existing decoder path. No HEVC bitstream was submitted to another codec.

The decoder enum mapper at movie-relative `0x2b62230` accepts only types 1–5,
returning `-1` outside that range. Its table at `0x36497a4` contains
`[0, 4, 1, 65, 66]`. The MIME parser at `0x2b62130` maps exactly the following
audio/video MIME suffixes to those backend values. Both the captured code and
calls to this pure parser on the console establish the mapping:

| Decoder type | Backend value | Recognized MIME | GPU output validation |
| --- | --- | --- | --- |
| 1 | 0 | `video/avc` (H.264) | Accepted |
| 2 | 4 | `video/x-vnd.on2.vp8` | Accepted |
| 3 | 1 | `video/x-vnd.on2.vp9` | Accepted |
| 4 | 65 | `audio/mp4a-latm` (AAC) | Rejected |
| 5 | 66 | `audio/vorbis` | Rejected |

Validation acceptance alone does not establish working VP8/VP9 decoding. Those
codecs were not decoded in this investigation and are not Moonlight stream
formats supported by our client. In particular, the previously unidentified
type 2 is VP8, not HEVC. The function at `0x2b52f30` initializes version-dependent
movie dispatch and returns true; its use by validation is not HEVC evidence.

On-device parser results for `video/hevc`, `video/h265`, `video/x-h265`,
`video/hvc1`, and `video/hev1` were all `-1`. Ten assertions cover these rejections
and five recognized formats. All probes returned the loader completion marker;
none created a decoder, submitted media, modified executable code, or wrote
Switch files. All captures and reports were saved locally in this repository.

## Evidence and reproducibility

- [Export inventory and constructor/validator capture](hevc-codec-inventory-switch.txt):
  23,037 SDK exports and 3,816 movie exports inspected. No explicitly named
  HEVC/H.265 decoder or configuration helper was found. Some regex matches
  are incidental (`DataV1`, `NoEnvDecode`), not codec support.
- [Enum mapping and output validation](hevc-codec-gate-switch.txt).
- [Referenced MIME/configuration literals](hevc-codec-strings-switch.txt).
- [Runtime MIME checks and assertions](hevc-mime-test-switch.txt).
- [Restored streaming UI](hevc-restored-ui-switch.txt): existing core retained
  in RAM and `MOONLIGHT_UI_READY` received after the investigation.
- [ARM64 disassembly of captured ranges](hevc-codec-map.asm.txt). Addresses
  are relative to the movie module, not reusable absolute process addresses.

Probe sources live in `investigation/probes/inspect-hevc*.js` and
`investigation/probes/test-hevc-mime.js`. Run the inventory with the established
`native-probe-helpers.js` and `native-movie-probe-helpers.js`, followed by the
gate, literal, and MIME probes, using `send-probe.py` and its bounded logger.
The literals and code offsets are specific to the tested game build.

The local captured ELF was built with `build-render-elf.py` from the inventory
and gate transcripts. REA/Hopper opened it but timed out starting its analysis
provider. The fallback used the installed Xcode Command Line Tools
`llvm-objdump -d --no-show-raw-insn`; no decompiler result is claimed.
The temporary REA binary session was closed.

Supporting HEVC would require investigating a separate lower-level decoder
interface, including codec configuration, service access, texture output, and
resource ownership. Changing Moonlight negotiation or relabeling a movie enum
does not supply that missing decoder.
