(async function(){
 var factory=window.__moonlightStreamFactory;
 var upload=window.__moonlightStreamModuleUpload;
 if(upload){factory=new Function(upload.parts.join('')+';return MoonlightStreamCore;')();window.__moonlightStreamFactory=factory;window.__moonlightStreamFactoryDigest=upload.sha256;delete window.__moonlightStreamModuleUpload;}
 if(!factory)throw Error('Missing runtime');
 var core=await factory({moonlightPlatform:{randomFill:function(bytes){bytes.fill(1);}}}),now=window.performance.now.bind(window.performance),runs=[];
 var checks={vectors:core._ml_test_fec_vectors(),recovery:core._ml_test_fec_large()};
 for(var i=0;i<6;i++){var fast=i%2,begin=now(),value=core._ml_fec_kernel_benchmark(fast);runs.push({fast:!!fast,ms:now()-begin,value:value});}
 var yields=core._ml_runtime_budget_yields();core._ml_fec_budget_test_start(4);var begin=now();core._ml_runtime_pump(1);var firstMs=now()-begin,pending=core._ml_fec_budget_test_result()===0,maxMs=firstMs,deadline=now()+10000;
 while(core._ml_runtime_tasks()&&now()<deadline){await new Promise(function(r){setTimeout(r,0);});begin=now();core._ml_runtime_pump(2);maxMs=Math.max(maxMs,now()-begin);}
 await log('MOONLIGHT_FEC_KERNEL_RESULT: '+JSON.stringify({checks:checks,runs:runs,budget:{firstMs:firstMs,maxMs:maxMs,yielded:pending,yields:core._ml_runtime_budget_yields()-yields,result:core._ml_fec_budget_test_result(),tasks:core._ml_runtime_tasks()}}));
 if(checks.vectors||checks.recovery||!pending||core._ml_fec_budget_test_result()!==1||core._ml_runtime_tasks())throw Error('FEC validation failed');
})();
