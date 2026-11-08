(async function(){
 var factory=window.__moonlightStreamFactory,upload=window.__moonlightStreamModuleUpload;
 if(upload){factory=new Function(upload.parts.join('')+';return MoonlightStreamCore;')();window.__moonlightStreamFactory=factory;window.__moonlightStreamFactoryDigest=upload.sha256;delete window.__moonlightStreamModuleUpload;}
 if(!factory)throw Error('Missing runtime');
 var core=await factory({moonlightPlatform:{randomFill:function(bytes){bytes.fill(1);}}}),now=performance.now.bind(performance),runs=[],checks=core._ml_test_packet_pool();
 if(checks)throw Error('Packet pool fixture '+checks);
 for(var turn=0;turn<6;turn++){var pooled=turn%2,begin=now(),result=core._ml_packet_pool_benchmark(pooled);runs.push({pooled:!!pooled,ms:now()-begin,result:result,metrics:Array.from(new Float64Array(core.HEAPU8.buffer,core._ml_packet_pool_metrics(),8))});if(result)throw Error('Packet pool benchmark '+result);}
 await log('MOONLIGHT_PACKET_POOL_RESULT: '+JSON.stringify({checks:checks,runs:runs}));
})();
