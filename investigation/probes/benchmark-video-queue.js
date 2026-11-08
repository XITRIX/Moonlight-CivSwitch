(async function(){
 var upload=window.__moonlightStreamModuleUpload;
 if(upload){window.__moonlightStreamFactory=new Function(upload.parts.join('')+';return MoonlightStreamCore;')();window.__moonlightStreamFactoryDigest=upload.sha256;delete window.__moonlightStreamModuleUpload;}
 var core=await window.__moonlightStreamFactory({moonlightPlatform:{randomFill:function(b){b.fill(1);}}}),now=performance.now.bind(performance),begin=now(),check=core._ml_test_video_queue(),checkMs=now()-begin,runs=[];
 if(check)throw Error('Queue equivalence failure '+check);
 for(var turn=0;turn<6;turn++){var fast=turn%2,start=now(),checksum=core._ml_video_queue_benchmark(fast,64);if(checksum!==528384)throw Error('Queue benchmark checksum '+checksum);runs.push({fast:!!fast,ms:now()-start,checksum:checksum});}
 await log('MOONLIGHT_QUEUE_RESULT: '+JSON.stringify({check:check,checkMs:checkMs,runs:runs}));
})();
