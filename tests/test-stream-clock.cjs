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
