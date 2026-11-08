#!/usr/bin/env python3
"""Characterize the GPU fence path, retaining synchronous completion for this probe."""
import argparse,json,subprocess,sys,tempfile
from pathlib import Path
here=Path(__file__).resolve().parent
root=here.parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('console_ip');p.add_argument('--output',type=Path,required=True)
a=p.parse_args();a.output.parent.mkdir(parents=True,exist_ok=True)
paths=[root/('app/'+s) for s in ['vendor/forge-1.4.3.min.js','src/storage/pairing-store.js','src/platform/native-network.js','src/streaming/native-io.js','src/streaming/telemetry.js','src/protocol/sunshine-pairing.js','src/protocol/sunshine-apps.js','src/streaming/native-texture.js','src/streaming/native-media.js','src/streaming/sunshine-session.js','src/streaming/stream-client.js','src/streaming/controller-input.js']]
with tempfile.TemporaryDirectory(prefix='gpu-fence-',dir=a.output.parent) as d:
 d=Path(d);s=paths[8].read_text()
 def replace(old,new):
  global s
  assert s.count(old)==1,old
  s=s.replace(old,new)
 replace('options=options||{};', 'options=options||{};options.synchronousGpu=true;var gpuProbeFence=0n,gpuProbeQueueMs=0,gpuProbeWaitMs=0,gpuProbeFallbacks=0,gpuProbeCodes={},fenceFunctions=global.MoonlightGpuSyncProbe.functions;')
 replace('call("_ZN5movie6Buffer9SetNvnDevEPv",[output,target.device]);',
  '''call("_ZN5movie6Buffer9SetNvnDevEPv",[output,target.device]);
   gpuProbeFence=alloc(256);if(!call_rop(fenceFunctions['4038698'],gpuProbeFence,target.device))throw Error('Fence initialization failed');
   call("_ZN5movie6Buffer10SetNvnSyncEPv",[output,gpuProbeFence]);''')
 replace('var copied=now(),url=texture.presentNative()',
  '''var queued=now(),code=number(call_rop(fenceFunctions['4038720'],gpuProbeFence,33333333n));
   gpuProbeCodes[code]=(gpuProbeCodes[code]||0)+1;
   if(code!==0&&code!==1){gpuProbeFallbacks++;call("_ZN5movie6Buffer10SetNvnSyncEPv",[output,0]);ok("_ZN5movie7Decoder15GetOutputBufferEiPNS_6BufferE",[decoder,slot,output]);call("_ZN5movie6Buffer10SetNvnSyncEPv",[output,gpuProbeFence]);}
   var waited=now();gpuProbeQueueMs+=queued-begin;gpuProbeWaitMs+=waited-queued;
   var copied=now(),url=texture.presentNative()''')
 replace('if(texture){texture.close();texture=null;}',
  "if(gpuProbeFence){call_rop(fenceFunctions['4038610'],gpuProbeFence);gpuProbeFence=0n;}if(texture){texture.close();texture=null;}")
 replace('gpuTransfers:gpuTransfers,gpuTransferMs:gpuTransferMs,',
  'gpuProbe:{queuedMs:gpuProbeQueueMs,waitMs:gpuProbeWaitMs,frames:gpuTransfers,fallbacks:gpuProbeFallbacks,codes:gpuProbeCodes},gpuTransfers:gpuTransfers,gpuTransferMs:gpuTransferMs,')
 media=d/'native-media.js';media.write_text(s);paths[8]=media
 config=d/'config.js';config.write_text('window.__moonlightPacingProbe={phase:"gpu-fence-wait",fps:60};\n')
 probe=d/'probe.js';s=(root/'investigation/probes/probe-frame-pacing.js').read_text();s=s.replace("phase:config.phase||'baseline',","gpuProbe:s&&s.gpuProbe,phase:config.phase||'baseline',")
 probe.write_text(s)
 subprocess.run([sys.executable,'-B',str(here/'send-probe.py'),a.console_ip,*map(str,[here/'native-probe-helpers.js',here/'native-movie-probe-helpers.js',here/'inspect-gpu-sync.js']+paths),str(config),str(probe),'--output',str(a.output),'--timeout','85'],check=True)
