#!/usr/bin/env python3
"""Run neutral-controller timing against the paired host, using bounded log transport."""
import argparse
from pathlib import Path
import subprocess
import sys
import tempfile

here = Path(__file__).resolve().parent
root = here.parents[1]
sys.path.insert(0, str(root / 'tools'))
from civswitch_sender import upload_module

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('console_ip')
parser.add_argument('--fps', type=int, choices=[30, 60], default=30)
parser.add_argument('--resolution', choices=['720','1080'], default='720')
parser.add_argument('--bitrate', type=int, choices=[3000,5000,10000], default=3000)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--skip-upload', action='store_true', help='Reuse the already loaded core')
parser.add_argument('--continuous', action='store_true', help='Stress input sending on every animation callback')
parser.add_argument('--runtime', type=Path, default=root / 'investigation/wasm2js/dist/moonlight-stream.js')
args = parser.parse_args()
args.output.parent.mkdir(parents=True, exist_ok=True)
if not args.skip_upload:
    with args.output.with_suffix('.upload.txt').open('wb') as trace:
        upload_module(args.console_ip, args.runtime.read_text(), trace)

scripts = [root / ('app/' + name) for name in [
    'vendor/forge-1.4.3.min.js', 'src/storage/pairing-store.js',
    'src/platform/native-network.js', 'src/streaming/native-io.js',
    'src/streaming/telemetry.js', 'src/protocol/sunshine-pairing.js',
    'src/protocol/sunshine-apps.js', 'src/streaming/native-texture.js',
    'src/streaming/native-media.js', 'src/streaming/sunshine-session.js',
    'src/streaming/stream-client.js', 'src/streaming/controller-input.js']]
# Keep the one-run rate selector on the Mac; only eval it in Switch RAM.
with tempfile.TemporaryDirectory(prefix='input-probe-', dir=args.output.parent) as temporary:
    selector = Path(temporary) / 'fps.js'
    selector.write_text(f'window.__moonlightInputProbeFps={args.fps};\nwindow.__moonlightInputProbeContinuous={str(args.continuous).lower()};\nwindow.__moonlightInputProbeMode={{width:{1920 if args.resolution=="1080" else 1280},height:{args.resolution},bitrate:{args.bitrate}}};\n')
    subprocess.run([sys.executable, '-B', str(here / 'send-probe.py'), args.console_ip,
                    *map(str, scripts), str(here / 'stream-input-observer.js'), str(selector),
                    str(root / 'investigation/wasm2js/probe-input-latency.js'),
                    '--output', str(args.output), '--timeout', '85'], check=True)
