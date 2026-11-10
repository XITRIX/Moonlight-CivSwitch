const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const neutral=[0,0,0,0,0,0,0];
function environment(prefs){
 const scope={};scope.window=scope;vm.createContext(scope);for(const path of ['app/src/storage/stream-settings.js','app/src/streaming/gamepad-mouse.js'])vm.runInContext(fs.readFileSync(path,'utf8'),scope);
 let time=0,result=0;const events=[];
 const input=scope.MoonlightGamepadMouse.create({now:()=>time,move:(...a)=>{events.push(['move',...a]);return result;},button:(...a)=>{events.push(['button',...a]);return result;},scroll:(...a)=>{events.push(['scroll',...a]);return result;},reset:()=>events.push(['reset']),onClose:()=>events.push(['close']),onKeyboard:()=>events.push(['keyboard']),onOptions:()=>events.push(['options']),onHints:()=>events.push(['hints']),onError:()=>events.push(['error'])});
 input.open(prefs);input.controller(neutral);events.length=0;
 return {input,events,tick:(t,state=neutral,enabled=true)=>{time=t;input.controller(state,enabled);},result:v=>result=v};
}
test('mouse movement preserves the reference speed/dead zone and is time-based across frame rates',()=>{
 function movement(fps,buttons=0,prefs){const e=environment(prefs);for(let i=1;i<=fps;i++)e.tick(i*1000/fps,[buttons,0,0,32767,0,0,0]);return e.events.filter(a=>a[0]==='move').reduce((n,a)=>n+a[1],0);}
 assert(Math.abs(movement(30)-909)<=1);assert(Math.abs(movement(60)-909)<=1);assert(Math.abs(movement(120)-909)<=1);
 assert(Math.abs(movement(60,0x100)-303)<=1);assert(Math.abs(movement(60,0x200)-1515)<=1);assert(Math.abs(movement(60,0x300)-909)<=1);
 assert(Math.abs(movement(60,0,{speed:0,swapButtons:false,invertScroll:false})-450)<=1);
 const e=environment();e.tick(16,[0,0,0,4000,0,0,0]);assert.equal(e.events.length,0);e.tick(32,[0x100,0,0,10000,0,0,0]);assert.equal(e.events.length,0);
 e.tick(48,[0,0,0,0,32767,0,0]);assert(e.events.at(-1)[2]<0,'up-positive stick becomes mouse-up');
 e.tick(10000,[0,0,0,32767,0,0,0]);assert(e.events.at(-1)[1]<=46,'stall cannot replay seconds of movement');
});
test('both triggers have independent edges, support dragging and swap mappings',()=>{
 for(const swapButtons of [false,true]){const e=environment({speed:34,swapButtons,invertScroll:false});
  e.tick(1,[0,0,255,0,0,0,0]);e.tick(2,[0,0,255,32767,0,0,0]);e.tick(3,[0,255,255,0,0,0,0]);e.tick(4,[0,255,0,0,0,0,0]);e.tick(5);
  const a=swapButtons?3:1,b=swapButtons?1:3;assert.deepEqual(e.events.filter(a=>a[0]==='button'),[['button',a,true],['button',b,true],['button',a,false],['button',b,false]]);
 }
});
test('scroll uses right-stick magnitude, dead zone, inversion, and no catch-up burst',()=>{
 for(const invertScroll of [false,true]){const e=environment({speed:34,swapButtons:false,invertScroll});const s=[0,0,0,0,0,0,-32767];
  e.tick(1,s);e.tick(50,s);assert.equal(e.events.length,0);e.tick(51,s);assert.deepEqual(e.events.at(-1),['scroll',0,invertScroll?-120:120]);
  e.tick(5000,s);assert.equal(e.events.filter(a=>a[0]==='scroll').length,2);e.tick(5001,s);assert.equal(e.events.length,2);
  e.tick(5010);e.tick(6000,[0,0,0,0,0,0,-5000]);assert.equal(e.events.length,2);
  e.tick(6100,[0,0,0,0,0,0,32767]);e.tick(6150,[0,0,0,0,0,0,32767]);assert.deepEqual(e.events.at(-1),['scroll',0,invertScroll?120:-120]);
 }
});
test('opening, pause and reconfiguration release queued drags and require neutral controls',()=>{
 const e=environment();e.tick(1,[0,0,255,0,0,0,0]);e.input.pause();assert.deepEqual(e.events.at(-1),['reset']);const n=e.events.length;
 e.tick(2,[0,0,255,32767,0,0,0]);assert.equal(e.events.length,n);e.input.resume();const m=e.events.length;
 e.tick(3,[0,0,255,32767,0,0,0]);e.tick(4,[0,0,0,32767,0,0,0]);assert.equal(e.events.length,m);
 e.tick(5);e.tick(6,[0,0,255,0,0,0,0]);assert.deepEqual(e.events.at(-1),['button',1,true]);e.input.close();assert.deepEqual(e.events.slice(-2),[['reset'],['close']]);
 e.tick(7,[0,0,255,32767,0,0,0]);assert.deepEqual(e.events.at(-1),['close']);
});
test('keyboard, options, hint toggle and back are edge-triggered local actions',()=>{
 for(const [flag,event] of [[0x8000,'keyboard'],[0x4000,'options'],[0x20,'hints']]){const e=environment();e.tick(1,[flag,0,0,0,0,0,0]);e.tick(2,[flag,0,0,0,0,0,0]);assert.equal(e.events.filter(a=>a[0]===event).length,1);if(event!=='hints')assert(e.input.isPaused());}
 const e=environment();e.tick(1,[0x1000,0,0,32767,0,0,0]);assert.deepEqual(e.events,[['reset'],['close']]);
});
test('queue failure cancels all pointer ownership and gates repeated controller snapshots',()=>{
 for(const kind of ['button','move','scroll']){const e=environment();e.result(-2);
  if(kind==='button')e.tick(20,[0,0,255,0,0,0,0]);else if(kind==='move')e.tick(20,[0,0,0,32767,0,0,0]);else {e.tick(1,[0,0,0,0,0,0,32767]);e.tick(60,[0,0,0,0,0,0,32767]);}
  assert.deepEqual(e.events.slice(-2),[['reset'],['error']]);const n=e.events.length;e.tick(70,[0,0,255,32767,0,0,0]);assert.equal(e.events.length,n);
  e.result(0);e.tick(80);e.tick(90,[0,0,255,0,0,0,0]);assert.deepEqual(e.events.at(-1),['button',1,true]);
 }
});
test('suspension and malformed snapshots reset input without emitting motion or clicks',()=>{
 const e=environment();e.tick(1,[0,0,255,32767,0,0,0],false);assert.deepEqual(e.events,[['reset']]);e.tick(2,[0,0,0,NaN,0,0,0]);assert.deepEqual(e.events.at(-1),['reset']);
});
