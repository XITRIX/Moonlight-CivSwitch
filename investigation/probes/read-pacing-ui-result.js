(async function(){
 var result=window.__moonlightOutageExitResult;
 if(!result)throw Error('No full-UI result in RAM');
 function rounded(key,value){return typeof value==='number'?Math.round(value*1000)/1000:value;}
 var summary=Object.assign({},result);delete summary.samples;
 await log('MOONLIGHT_PACING_UI_RESULT: '+JSON.stringify(summary,rounded));
 for(var sample of result.samples||[])await log('MOONLIGHT_PACING_UI_SAMPLE: '+JSON.stringify(sample,rounded));
 if(result.failed||result.state||result.tasks)throw Error('Full-UI validation failed');
})();
