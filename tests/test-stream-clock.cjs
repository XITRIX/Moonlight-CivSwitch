const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('stream clock uses frame callbacks, cancels the watchdog and can wake immediately for stop',async()=>{
 let next=1,time=0;const frames=new Map(),timers=new Map();
 const scope={performance:{now:()=>time},setTimeout:fn=>{const id=next++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=next++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 const clock=scope.MoonlightStreamClient.createClock(),first=clock.wait();assert.equal(clock.wait(),first);assert.equal(frames.size,1);assert.equal(timers.size,1);
 time=16.7;frames.values().next().value();await first;assert.equal(frames.size,0);assert.equal(timers.size,0);assert.equal(clock.stats.frameWakes,1);
 const second=clock.wait();clock.wake();await second;assert.equal(clock.stats.forcedWakes,1);assert.equal(frames.size,0);assert.equal(timers.size,0);
 const hidden=clock.wait();time=66.7;timers.values().next().value();await hidden;assert.equal(clock.stats.timerWakes,1);assert.equal(frames.size,0);assert.equal(timers.size,0);
});

function environment(){
 let next=1,time=0;const frames=new Map(),timers=new Map();
 const scope={performance:{now:()=>time},setTimeout:(fn,delay)=>{const id=next++;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=next++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 return {clock:scope.MoonlightStreamClient.createClock(),frames,timers,advance:n=>time=n,fire:delay=>{const [id,t]=[...timers].find(([,t])=>t.delay===delay);timers.delete(id);t.fn();}};
}
test('one service turn retains the display callback and watchdog without scheduling another turn',async()=>{
 const e=environment();let serviced=0,settled=false;const promise=e.clock.wait(()=>serviced++);promise.then(()=>settled=true);
 e.advance(4);e.fire(4);await Promise.resolve();assert.equal(serviced,1);assert.equal(settled,false);assert.equal(e.frames.size,1);assert.equal(e.timers.size,1);
 assert.equal(e.clock.wait(),promise);e.advance(16.7);e.frames.values().next().value();await promise;
 assert.equal(e.clock.stats.serviceWakes,1);assert.equal(e.clock.stats.frameWakes,1);assert.equal(e.timers.size,0);assert.equal(e.frames.size,0);
});
test('frame and stop cancellation suppress late service callbacks',async()=>{
 for(const reason of ['frame','stop']){
  const e=environment();let serviced=0;const promise=e.clock.wait(()=>serviced++),stale=[...e.timers.values()].find(t=>t.delay===4).fn;
  if(reason==='frame')e.frames.values().next().value();else e.clock.wake();await promise;
  stale();assert.equal(serviced,0);assert.equal(e.frames.size,0);assert.equal(e.timers.size,0);
 }
});
test('service failure rejects the awaited frame and cancels all callbacks',async()=>{
 const e=environment(),error=Error('audio service failed'),promise=e.clock.wait(()=>{throw error;});
 const rejected=assert.rejects(promise,e=>e===error);e.fire(4);await rejected;assert.equal(e.frames.size,0);assert.equal(e.timers.size,0);
});
