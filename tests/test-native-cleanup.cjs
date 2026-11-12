const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(fail){
 const s={};s.window=s;vm.createContext(s);vm.runInContext(fs.readFileSync('app/src/streaming/native-cleanup.js','utf8'),s);
 const events=[],names=new Map();let next=1000n;
 const context={resolve(name){const id=next++;names.set(id,name);return id;},call(address,...args){const name=names.get(address);events.push([name,...args.map(String)]);if(name===fail)throw Error('uncertain native call');return 0n;},release(p){events.push(['release',String(p)]);},close(){events.push(['context.close']);}};
 const ledger=s.MoonlightNativeCleanup.create(context);
 return {ledger,events};
}
function record(ledger){
 ledger.recordDisplay({display:{device:'11',queue:'12',layer:20000},objects:[
  {kind:'instance',handle:'10',destroy:{name:'vkDestroyInstance',args:['$handle',0]}},
  {kind:'device',handle:'11',destroy:{name:'vkDestroyDevice',args:['$handle',0]}},
  {kind:'queue',handle:'12',destroy:null},
  {kind:'layer',handle:'20000',destroy:{name:'_ZN2nn2vi5Layer5CloseEb',args:['$handle',0]}},
  {kind:'swapchain',handle:'13',destroy:{name:'vkDestroySwapchainKHR',args:['11','$handle',0]}}
 ]});
 ledger.recordRenderer([{kind:'allocation',handle:'21000',destroy:'release'},{kind:'buffer',handle:'20',destroy:'vkDestroyBuffer'},{kind:'commandPool',handle:'21',destroy:'vkDestroyCommandPool'},{kind:'pipeline',handle:'22',destroy:'vkDestroyPipeline'},{kind:'commandBuffer',handle:'23',destroy:null}]);
 ledger.recordAllocation(22000);
}
test('unqualified swapchain close performs no cleanup, including refresh or fences',async()=>{
 const {ledger,events}=setup();record(ledger);
 await assert.rejects(ledger.close({refresh:{close(){events.push(['refresh']);}},present:{finish(){events.push(['finish']);}}}),/not qualified/);
 assert.deepEqual(events,[]);assert.equal(ledger.snapshot().quarantined,false);
 await ledger.close({allowSwapchainDestroy:true});assert.equal(ledger.snapshot().closed,true);
});
test('cleanup drains work, destroys commands before resources, then releases only owned memory',async()=>{
 const {ledger,events}=setup();record(ledger);
 const options={allowSwapchainDestroy:true,refresh:{close(){events.push(['refresh']);}},present:{finish(){events.push(['finish']);}}};
 const first=ledger.close(options);assert.equal(ledger.close(options),first);await first;
 assert.deepEqual(events.map(e=>e[0]),['refresh','finish','vkQueueWaitIdle','vkDestroyCommandPool','vkDestroyPipeline','vkDestroyBuffer','vkDestroySwapchainKHR','_ZN2nn2vi5Layer5CloseEb','vkDestroyDevice','vkDestroyInstance','release','release','release','context.close']);
 assert.deepEqual(events.find(e=>e[0]==='vkDestroyBuffer'),['vkDestroyBuffer','11','20','0']);
 assert(!events.some(e=>e.includes('12')&&e[0]!=='vkQueueWaitIdle'));
 const count=events.length;await ledger.close(options);assert.equal(events.length,count);
 assert.equal(ledger.snapshot().objects.find(e=>e.kind==='commandBuffer').status,'borrowed');
});
test('an uncertain destructor quarantines remaining owners and never retries a completed destroy',async()=>{
 const {ledger,events}=setup('vkDestroyPipeline');record(ledger);
 await assert.rejects(ledger.close({allowSwapchainDestroy:true}),/uncertain/);
 const snapshot=ledger.snapshot();assert.equal(snapshot.quarantined,true);
 assert.equal(snapshot.objects.find(e=>e.kind==='commandPool').status,'destroyed');
 assert.equal(snapshot.objects.find(e=>e.kind==='buffer').status,'owned');
 assert(!events.some(e=>e[0]==='release'));const count=events.length;
 await assert.rejects(ledger.close({allowSwapchainDestroy:true}),/quarantined/);assert.equal(events.length,count);
});
test('partial setup metadata can be recorded without freeing borrowed handles or unknown functions',async()=>{
 const {ledger,events}=setup();ledger.recordDisplay({objects:[{kind:'queue',handle:'12',destroy:null}]});
 ledger.recordRenderer([{kind:'allocation',handle:'30000',destroy:'release'}]);ledger.recordAllocation(30000);
 await ledger.close();assert.deepEqual(events,[['vkQueueWaitIdle','12'],['release','30000'],['context.close']]);
 const other=setup();assert.throws(()=>other.ledger.recordRenderer([{kind:'buffer',handle:'30',destroy:'vkDestroyDevice'}]),/Unexpected/);assert.deepEqual(other.events,[]);
});
test('already retired layers are refused before any native work',async()=>{
 const {ledger,events}=setup();record(ledger);
 await assert.rejects(ledger.close({allowSwapchainDestroy:true,display:{device:'11',queue:'12',retired:true}}),/already retired/);assert.deepEqual(events,[]);
});
test('a failed display build can release its completed instance before any queue exists',async()=>{
 const {ledger,events}=setup();ledger.recordAllocation(31000);
 ledger.recordDisplay({objects:[{kind:'instance',handle:'10',destroy:{name:'vkDestroyInstance',args:['$handle',0]}}]});
 await ledger.close();assert.deepEqual(events.map(e=>e[0]),['vkDestroyInstance','release','context.close']);
});
test('a failed idle wait retains every native owner and all backing allocations',async()=>{
 const {ledger,events}=setup('vkQueueWaitIdle');record(ledger);
 await assert.rejects(ledger.close({allowSwapchainDestroy:true}),/uncertain/);
 assert.deepEqual(events.map(e=>e[0]),['vkQueueWaitIdle']);assert.equal(ledger.snapshot().quarantined,true);
 assert(ledger.snapshot().objects.every(e=>e.status==='owned'||e.status==='borrowed'));
 assert(ledger.snapshot().allocations.every(e=>e.status==='owned'));
});
test('temporary display teardown retains the shared decoder context after freeing display owners',async()=>{
 const {ledger,events}=setup();record(ledger);
 const result=await ledger.close({allowSwapchainDestroy:true,keepContext:true});
 assert.equal(result.closed,true);assert.equal(result.contextRetained,true);
 assert(!events.some(e=>e[0]==='context.close'));
 assert.equal(events.filter(e=>e[0]==='release').length,3);
 const count=events.length;await ledger.close({allowSwapchainDestroy:true});
 assert.equal(events.length,count,'a disposed display ledger cannot close a context now owned by its caller');
});
test('bound memory survives its buffer and views despite allocation after buffer creation',async()=>{
 const {ledger,events}=setup();
 ledger.recordDisplay({display:{device:'11',queue:'12'},objects:[]});
 ledger.recordRenderer([{kind:'buffer',handle:'20',destroy:'vkDestroyBuffer'},{kind:'memory',handle:'30',destroy:'vkFreeMemory'},{kind:'bufferView',handle:'40',destroy:'vkDestroyBufferView'}]);
 await ledger.close({keepContext:true});
 assert.deepEqual(events.map(e=>e[0]),['vkQueueWaitIdle','vkDestroyBufferView','vkDestroyBuffer','vkFreeMemory']);
});
test('release verification runs after native owners die and quarantines all backing allocations on failure',async()=>{
 const {ledger,events}=setup();record(ledger);
 await assert.rejects(ledger.close({allowSwapchainDestroy:true,verifyReleased:async value=>{
  assert(value.snapshot.objects.every(e=>e.status==='destroyed'||e.status==='borrowed'));
  assert(!events.some(e=>e[0]==='release'));await Promise.resolve();throw Error('VI ownership remains');
 }}),/VI ownership remains/);
 const snapshot=ledger.snapshot();assert.equal(snapshot.quarantined,true);assert.equal(snapshot.closed,false);
 assert(snapshot.allocations.every(e=>e.status==='owned'));
 assert(!events.some(e=>e[0]==='release'||e[0]==='context.close'));
 const count=events.length;await assert.rejects(ledger.close({allowSwapchainDestroy:true}),/quarantined/);assert.equal(events.length,count);
});
test('successful release verification finishes before the first backing allocation is freed',async()=>{
 const {ledger,events}=setup();record(ledger);
 await ledger.close({allowSwapchainDestroy:true,verifyReleased:async()=>{await Promise.resolve();events.push(['verified']);}});
 const names=events.map(e=>e[0]);assert(names.indexOf('verified')>names.indexOf('vkDestroyInstance'));assert(names.indexOf('verified')<names.indexOf('release'));
});
