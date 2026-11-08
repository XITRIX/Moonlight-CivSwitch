#!/usr/bin/env python3
"""Upload the streaming runtime and run the selected bounded experiment."""
import argparse
from pathlib import Path
import sys

here = Path(__file__).resolve().parent
root = here.parents[1]
sys.path.insert(0, str(root / 'tools'))
from civswitch_sender import send_payload, upload_module

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('console_ip')
parser.add_argument('--probe', type=Path, default=here / 'probe-runtime.js')
parser.add_argument('--output', type=Path, default=here.parent / 'evidence/streaming-runtime-console.txt')
parser.add_argument('--extra', type=Path, action='append', default=[])
parser.add_argument('--timeout', type=int, default=60)
args = parser.parse_args()
scripts = [root / p for p in ['app/vendor/forge-1.4.3.min.js', 'app/src/storage/pairing-store.js',
           'app/src/platform/native-network.js', 'app/src/streaming/native-io.js', 'app/src/streaming/telemetry.js']]
args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open('wb') as output:
    upload_module(args.console_ip, (root / 'dist/runtime/moonlight-stream.js').read_text(), output)
    payload = b';\n'.join(path.read_bytes() for path in scripts + args.extra + [args.probe])
    send_payload(args.console_ip, payload, output, args.timeout)
