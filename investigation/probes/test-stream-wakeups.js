/* Compare frame and timer scheduling with the same small simulated workload. */
(async function(){
 function now(){return performance.now();}
 async function run(name,prearm,frame){
  var previous=null,intervals=[],waits=[];
  for(var i=0;i<24;i++){
   var begin=now();if(previous!==null)intervals.push(begin-previous);previous=begin;
   function wake(){return new Promise(function(done){if(frame)requestAnimationFrame(done);else setTimeout(done,2);});}
   var next=prearm?wake():null,until=now()+3;while(now()<until){}
   var wait=now();await(next||wake());waits.push(now()-wait);
  }
  function summarize(v){v.sort(function(a,b){return a-b;});return {min:v[0],median:v[Math.floor(v.length/2)],max:v[v.length-1],mean:v.reduce(function(a,b){return a+b;},0)/v.length};}
  await log('MOONLIGHT_WAKEUP_'+name+': '+JSON.stringify({intervalMs:summarize(intervals),waitMs:summarize(waits)}));
 }
 await run('POST_TIMER',false,false);await run('POST_FRAME',false,true);await run('PRE_FRAME',true,true);await run('PRE_TIMER',true,false);
})();
