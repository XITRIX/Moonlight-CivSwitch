(async function(){
 var factory=window.__moonlightStreamFactory,upload=window.__moonlightStreamModuleUpload;
 if(upload){factory=new Function(upload.parts.join('')+';return MoonlightStreamCore;')();window.__moonlightStreamFactory=factory;window.__moonlightStreamFactoryDigest=upload.sha256;delete window.__moonlightStreamModuleUpload;}
 if(!factory)throw Error('Missing runtime');
 var core=await factory({moonlightPlatform:{randomFill:function(bytes){bytes.fill(1);}}}),clock=performance.now.bind(performance),slots=new Uint32Array(128),tags=new Uint8Array(128),runs=[];
 for(var turn=0;turn<3;turn++){
  var begin=clock();
  try{
   for(var i=0;i<4096;i++){
    var slot=i%slots.length,p=slots[slot];
    if(p){if(core.HEAPU8[p]!==tags[slot]||core.HEAPU8[p+1455]!==tags[slot])throw Error('Allocator lifetime mismatch');core._free(p);slots[slot]=0;}
    p=core._malloc(1456);if(!p)throw Error('Allocator exhausted');slots[slot]=p;tags[slot]=i%251;core.HEAPU8[p]=core.HEAPU8[p+1455]=tags[slot];
   }
  }finally{for(var i=0;i<slots.length;i++)if(slots[i]){core._free(slots[i]);slots[i]=0;}}
  runs.push({allocations:4096,outstanding:128,bytes:1456,ms:clock()-begin});
 }
 await log('MOONLIGHT_PACKET_ALLOCATOR_RESULT: '+JSON.stringify({digest:window.__moonlightStreamFactoryDigest,runs:runs}));
})();
