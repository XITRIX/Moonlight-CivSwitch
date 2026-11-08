#!/usr/bin/env python3
"""Summarize measured publication rates, not physical display scanout."""
import argparse
import json
from pathlib import Path
import statistics

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('logs',nargs='+',type=Path)
parser.add_argument('--output',type=Path)
args=parser.parse_args()
summary={'scope':'Sequential live runs; scenes and LAN may differ. Means omit first two samples. Texture FPS is publication, not scanout.', 'runs':{}}
for path in args.logs:
    lines=path.read_text().splitlines()
    rows=[]
    for line in lines:
        if ': {' not in line:continue
        name,value=line.split(': ',1)
        try:rows.append((name,json.loads(value)))
        except ValueError:continue
    result=next((value for name,value in rows if name.endswith('_RESULT')),None)
    samples=[value for name,value in rows if name in ('MOONLIGHT_PACING_SAMPLE','MOONLIGHT_INPUT_STREAM')]
    if result and 'samples' in result:samples=result['samples']
    steady=samples[2:]
    metrics={}
    for key in ['decodedFps','textureFps','receivedMbps','rttMs','frameReceiveMs','decodeReadyMs','presentAgeMs','loopHz','pumpAvgMs','frameJitterMs']:
        values=[s[key] for s in steady if s.get(key) is not None]
        if values:metrics[key]={'mean':round(statistics.mean(values),3),'min':min(values),'max':max(values)}
    entry={'completed':bool(lines and lines[-1]=='Executed successfully'),'samples':len(samples),'steadySamples':len(steady),'metrics':metrics,'maximumCounters':{key:max((s.get(key,0) for s in samples),default=None) for key in ['audioDiscardedMs','videoFrameGaps','decoderRejected','audioFecFailed']},'result':{key:value for key,value in (result or {}).items() if key not in ('samples','histogram')}}
    summary['runs'][path.name]=entry
    print(path.name,json.dumps({'completed':entry['completed'],'means':{k:v['mean'] for k,v in metrics.items()},'counters':entry['maximumCounters'],'error':(result or {}).get('error'),'decoded':(result or {}).get('decoded'),'presented':(result or {}).get('presented')}))
if args.output:args.output.write_text(json.dumps(summary,indent=2)+'\n')
