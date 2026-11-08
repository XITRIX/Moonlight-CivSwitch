#!/usr/bin/env python3
"""Exercise full-UI local exit under a simulated stream outage or healthy shutdown."""
import argparse
import json
from pathlib import Path
import sys

here=Path(__file__).resolve().parent
root=here.parents[1]
sys.path.insert(0,str(root/'tools'))
from civswitch_sender import send_payload, upload_module
from send_ui import APP_DIR, APP_SCRIPTS
from probe_transport import wrap_payload, LogDecoder

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('console_ip')
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--healthy',action='store_true')
parser.add_argument('--skip-upload',action='store_true')
parser.add_argument('--fps',type=int,choices=[15,30,60],help='Override this test stream only; saved settings are unchanged')
parser.add_argument('--measure-ms',type=int,default=0,help='Collect ordinary UI telemetry before the fault (0–20000 ms)')
args=parser.parse_args()
if not 0<=args.measure_ms<=20000:parser.error('--measure-ms must be between 0 and 20000')
args.output.parent.mkdir(parents=True,exist_ok=True)
if not args.skip_upload:
    with args.output.with_suffix('.upload.txt').open('wb') as trace:
        upload_module(args.console_ip,(root/'investigation/wasm2js/dist/moonlight-stream.js').read_text(),trace)
parts=[(APP_DIR/p).read_text() for p in APP_SCRIPTS[:-1]]
entry=(APP_DIR/APP_SCRIPTS[-1]).read_text().rstrip().removesuffix(';')
helper=(here/'test-stream-outage-exit.js').read_text()
source=';\n'.join(parts)+';\n(async function(){window.__moonlightExitTestHealthy='+str(args.healthy).lower()+';window.__moonlightExitTestConfig='+json.dumps({'fps':args.fps,'measureMs':args.measure_ms})+';\n'+helper+'\nreturn await '+entry+';})();'
wire=args.output.with_suffix('.wire.txt')
with wire.open('wb') as trace:
    send_payload(args.console_ip,wrap_payload(source),trace,65)
decoder=LogDecoder()
lines=decoder.feed(wire.read_bytes())
decoder.finish()
args.output.write_text('\n'.join(lines)+'\n')
result=next(json.loads(line.split(': ',1)[1]) for line in lines if line.startswith('MOONLIGHT_OUTAGE_EXIT_RESULT: '))
if result['failed'] or result['state']!=0 or result['tasks']!=0:
    raise SystemExit('Local exit failed; inspect '+str(args.output))
print(json.dumps(result))
