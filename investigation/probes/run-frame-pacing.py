#!/usr/bin/env python3
"""Compare rendering phases without storing any files on the Switch."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile

here=Path(__file__).resolve().parent
root=here.parents[1]
sys.path.insert(0,str(root/'tools'))
from civswitch_sender import upload_module
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('console_ip')
parser.add_argument('--phase',choices=['baseline','before','hybrid','split','current'],default='current')
parser.add_argument('--continuous',action='store_true')
parser.add_argument('--input-period-ms',type=int,choices=[10000,15000],help='Alternate idle and neutral input load in equal windows')
parser.add_argument('--fps',type=int,choices=[30,60],default=60)
parser.add_argument('--resolution',choices=['720','1080'],default='720')
parser.add_argument('--bitrate',type=int,choices=[3000,5000,10000,15000,20000,25000,30000,40000,50000,60000,70000,80000],default=3000)
parser.add_argument('--pump-ms',type=float,choices=[6+i*.5 for i in range(19)])
parser.add_argument('--pre-pump-ms',type=int,choices=range(0,7),default=0)
parser.add_argument('--synchronous-gpu',action='store_true')
parser.add_argument('--low-latency',action='store_true')
parser.add_argument('--completion-pump-ms',type=int,choices=range(1,7))
parser.add_argument('--skip-upload',action='store_true')
parser.add_argument('--runtime',type=Path,default=root/'investigation/wasm2js/dist/moonlight-stream.js',help='Use an explicit artifact for controlled compiler comparisons')
parser.add_argument('--profile-io',action='store_true',help='Time socket adapter operations in RAM, reported only after stop')
parser.add_argument('--fec-work-limit',type=int,choices=[0,131072,262144,524288],help='Bound estimated multi-erasure video recovery work; audio and single erasures are retained')
parser.add_argument('--raw-video-profile',action='store_true',help='Discard eight seconds of video to measure raw native/LAN reception')
parser.add_argument('--reference-recovery',action='store_true',help='Probe native H.264 reference-frame recovery without modifying saved settings')
parser.add_argument('--packet-pool',action='store_true',help='Enable the experimental reusable video-packet buffer pool')
parser.add_argument('--max-video-age-ms',type=int,choices=[50,80,100,150],help='Experiment: discard aged cleartext video RTP before C processing')
parser.add_argument('--receive-batch-size',type=int,choices=[32,64],default=32,help='Compare already-available receive batches without waiting to fill them')
parser.add_argument('--duration-ms',type=int,default=24000,help='Bounded live stream duration (10000–120000 ms)')
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
if not 10000<=args.duration_ms<=120000:parser.error('--duration-ms must be between 10000 and 120000')
pump_budget=args.pump_ms or (13.5 if args.fps==60 and args.bitrate>=80000 else 12 if args.fps==60 and (args.resolution=='1080' or args.bitrate>=8000) else 10)
args.output.parent.mkdir(parents=True,exist_ok=True)
if not args.skip_upload:
 with args.output.with_suffix('.upload.txt').open('wb') as trace:
  upload_module(args.console_ip,args.runtime.read_text(),trace)
paths=[root/('app/'+p) for p in ['vendor/forge-1.4.3.min.js','src/storage/pairing-store.js','src/platform/native-network.js','src/streaming/native-io.js','src/streaming/telemetry.js','src/protocol/sunshine-pairing.js','src/protocol/sunshine-apps.js','src/streaming/native-texture.js','src/streaming/native-media.js','src/streaming/sunshine-session.js','src/streaming/stream-client.js','src/streaming/controller-input.js']]
with tempfile.TemporaryDirectory(prefix='pacing-probe-',dir=args.output.parent) as directory:
 directory=Path(directory)
 if args.receive_batch_size!=32:
  source=(here/'native-io-batch64-candidate.js').read_text();assert source.count('batchSize=options.batchSize===64?64:32,')==1
  paths[3]=directory/'native-io.js';paths[3].write_text(source.replace('batchSize=options.batchSize===64?64:32,',f'batchSize={args.receive_batch_size},'))
 if args.phase!='current' or args.pre_pump_ms or args.completion_pump_ms or args.pump_ms is not None:
  source=paths[10].read_text()
  start=source.index('     // Queue video')
  end=source.index('     if(failure)throw failure;',start)
  if args.completion_pump_ms or args.pump_ms is not None:
   assert args.phase=='current' and not args.pre_pump_ms
   first=args.completion_pump_ms or 4
   step=f'var begin=global.MoonlightTelemetry.now(),videoOccupied=media.drainVideo();var early=global.MoonlightTelemetry.now();core._ml_runtime_pump({first});var pumpedEarly=global.MoonlightTelemetry.now();media.finishVideo();if(!videoOccupied&&{args.bitrate}>=40000)media.drainVideo();var finishedEarly=global.MoonlightTelemetry.now();core._ml_runtime_pump({pump_budget-first});var pumped=global.MoonlightTelemetry.now();media.finishVideo(Math.min(begin+{pump_budget}+2,global.MoonlightTelemetry.now()+3));media.drainAudio();var drained=global.MoonlightTelemetry.now();'
   timing='var pumpElapsed=pumpedEarly-early+pumped-finishedEarly,drainElapsed=early-begin+finishedEarly-pumpedEarly+drained-pumped;'
  elif args.phase=='current':
   step=f'var begin=global.MoonlightTelemetry.now();core._ml_runtime_pump({args.pre_pump_ms});var priority=global.MoonlightTelemetry.now();media.drainVideo();var early=global.MoonlightTelemetry.now();core._ml_runtime_pump({10-args.pre_pump_ms});var pumped=global.MoonlightTelemetry.now();media.finishVideo();media.drainAudio();var drained=global.MoonlightTelemetry.now();'
   timing='var pumpElapsed=priority-begin+pumped-early,drainElapsed=early-priority+drained-pumped;'
  elif args.phase=='hybrid':
   step='var begin=global.MoonlightTelemetry.now(),before=media.stats().presented;media.drainVideo();var early=global.MoonlightTelemetry.now(),presented=media.stats().presented!==before;core._ml_runtime_pump(10);var pumped=global.MoonlightTelemetry.now();if(!presented)media.drainVideo();media.drainAudio();var drained=global.MoonlightTelemetry.now();'
   timing='var pumpElapsed=pumped-early,drainElapsed=early-begin+drained-pumped;'
  elif args.phase=='split':
   step='var begin=global.MoonlightTelemetry.now();core._ml_runtime_pump(2);var early=global.MoonlightTelemetry.now();media.drainVideo();media.drainAudio();var drained=global.MoonlightTelemetry.now();core._ml_runtime_pump(8);var pumped=global.MoonlightTelemetry.now();'
   timing='var pumpElapsed=early-begin+pumped-drained,drainElapsed=drained-early;'
  elif args.phase=='before':
   step='var begin=global.MoonlightTelemetry.now();media.drainVideo();media.drainAudio();var drained=global.MoonlightTelemetry.now();core._ml_runtime_pump(10);var pumped=global.MoonlightTelemetry.now();'
   timing='var pumpElapsed=pumped-drained,drainElapsed=drained-begin;'
  else:
   step='var begin=global.MoonlightTelemetry.now();core._ml_runtime_pump(10);var pumped=global.MoonlightTelemetry.now();media.drainVideo();media.drainAudio();var drained=global.MoonlightTelemetry.now();'
   timing='var pumpElapsed=pumped-begin,drainElapsed=drained-pumped;'
  source=source[:start]+step+timing+'pumpMs+=pumpElapsed;drainMs+=drainElapsed;maxPumpMs=Math.max(maxPumpMs,pumpElapsed);maxDrainMs=Math.max(maxDrainMs,drainElapsed);iterations++;\n'+source[end:]
  paths[10]=directory/'stream-client.js';paths[10].write_text(source)
 selector=directory/'config.js';selector.write_text('window.__moonlightPacingProbe='+json.dumps({'durationMs':args.duration_ms,'phase':args.phase,'prePumpMs':args.pre_pump_ms,'completionPumpMs':args.completion_pump_ms or ((6 if pump_budget==12 and args.bitrate<40000 else 4) if args.phase=='current' and not args.pre_pump_ms else 0),'smoothVideo':not args.low_latency,'synchronousGpu':args.synchronous_gpu or args.phase!='current','continuous':args.continuous,'inputPeriodMs':args.input_period_ms,'fps':args.fps,'pumpBudgetMs':pump_budget,'width':1920 if args.resolution=='1080' else 1280,'height':int(args.resolution),'bitrate':args.bitrate})+';\n')
 if args.raw_video_profile:paths.append(here/'profile-raw-video.js')
 if args.reference_recovery:
  recovery=directory/'reference-recovery.js';recovery.write_text('''(function(){var make=window.MoonlightStreamIO.create;
window.MoonlightStreamIO.create=function(t,o){var io=make(t,o),attach=io.attachCore;io.attachCore=function(core){if(core._ml_session_set_reference_recovery(1)!==0)throw Error('Reference recovery rejected');return attach.call(io,core);};return io;};})();''');paths.append(recovery)
 if args.packet_pool:
  pool=directory/'packet-pool.js';pool.write_text('''(function(){var make=window.MoonlightStreamIO.create;
window.MoonlightStreamIO.create=function(t,o){var io=make(t,o),attach=io.attachCore;io.attachCore=function(core){if(core._ml_packet_pool_configure(1)!==0)throw Error('Packet pool rejected');return attach.call(io,core);};return io;};})();''');paths.append(pool)
 if args.fec_work_limit is not None:
  policy=directory/'fec-policy.js';policy.write_text('''(function(){var make=window.MoonlightStreamIO.create;
window.MoonlightStreamIO.create=function(t,o){var io=make(t,o),attach=io.attachCore;io.attachCore=function(core){if(!core._ml_fec_set_work_limit)throw Error('Archived recovery experiment is unavailable in the production runtime');if(core._ml_fec_set_work_limit(LIMIT)!==0)throw Error('FEC policy rejected');return attach.call(io,core);};return io;};})();'''.replace('LIMIT',str(args.fec_work_limit)))
  paths.append(policy)
 if args.max_video_age_ms:
  age=directory/'limit-video-age.js';age.write_text('window.__moonlightMaxVideoAgeMs='+str(args.max_video_age_ms)+';\n'+(here/'limit-video-age.js').read_text());paths.append(age)
 if args.profile_io:
  profiler=directory/'profile-io.js';profiler.write_text('''(function(){var make=window.MoonlightStreamIO.create;
window.MoonlightStreamIO.create=function(t,o){var io=make(t,o),raw=io.io,counts=new Uint32Array(12),costs=new Float64Array(12),now=window.MoonlightTelemetry.now,buffers=[];
io.stats.operationCounts=counts;io.stats.operationMs=costs;io.stats.receiveBuffers=buffers;
io.io=function(op,args,heap){var begin=now(),result;try{return result=raw(op,args,heap);}finally{counts[op]++;costs[op]+=now()-begin;
if(op===7&&args[1]===1&&args[2]===8&&buffers.length<128){var r={fd:args[0],requested:new DataView(heap.buffer).getInt32(args[3],true),result:result};
if(result===0){var p=malloc(8),n=malloc(8);try{write32(n,4n);r.query=Number(io.invoke('_ZN2nn6socket10GetSockOptEiiiPvPj',[args[0],65535,4098,p,n]));if(r.query===0)r.actual=Number(read32(p));}finally{free(n);free(p);}}buffers.push(r);}
}};return io;};})();''')
  paths.append(profiler)
 subprocess.run([sys.executable,'-B',str(here/'send-probe.py'),args.console_ip,*map(str,paths),str(selector),str(root/'investigation/wasm2js/probe-frame-pacing.js'),'--output',str(args.output),'--timeout',str(args.duration_ms//1000+61)],check=True)
