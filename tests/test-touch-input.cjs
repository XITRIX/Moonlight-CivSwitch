const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/src/streaming/touch-input.js','utf8');
function load(scope={}){scope.window=scope;vm.createContext(scope);vm.runInContext(source,scope);return scope.MoonlightTouchInput;}
function environment(mode='trackpad',extra={}){
 let time=0,result=0;const events=[],errors=[];
 const api=load(),input=api.create({mode,width:1280,height:720,bounds:()=>({left:0,top:0,width:1280,height:720}),startBlocked:false,now:()=>time,
  mouseMove:(...a)=>{events.push(['move',...a]);return result;},mouseButton:(...a)=>{events.push(['button',...a]);return result;},mouseScroll:(...a)=>{events.push(['scroll',...a]);return result;},touch:(...a)=>{events.push(['touch',...a]);return result;},reset:()=>events.push(['reset']),onError:e=>errors.push(e),...extra});
 return {input,events,errors,buttons:()=>events.filter(e=>e[0]==='button'),update:(t,points,enabled=true)=>{time=t;input.update(points,enabled);},result:n=>result=n};
}
const p=(id,x=100,y=100)=>({id,x,y});
test('live mode changes cancel held input and wait for neutral before the new mode sends contacts',()=>{
 const e=environment();e.update(0,[p(1)]);e.update(30,[]);e.update(100,[p(2)]);
 assert.deepEqual(e.buttons().at(-1),['button',1,true]);e.input.setMode('touchpad');assert.deepEqual(e.events.at(-1),['reset']);
 const before=e.events.length;e.update(110,[p(2,130)]);assert.equal(e.events.length,before);
 e.update(120,[]);e.update(130,[p(3)]);assert.deepEqual(e.events.at(-1).slice(0,3),['touch',1,3]);
 e.input.setMode('trackpad');assert.deepEqual(e.events.at(-1),['reset']);e.update(140,[]);e.update(150,[p(4)]);e.update(170,[]);
 assert.deepEqual(e.buttons().slice(-2),[['button',1,true],['button',1,false]]);
 assert.throws(()=>e.input.setMode('invalid'),/Invalid touchscreen mode/);
});
test('third contact opens the keyboard once on landing in either pointer mode and cancels remote contacts',()=>{
 for(const mode of ['trackpad','touchpad']){
  let opens=0;const e=environment(mode,{onKeyboard:()=>opens++});
  e.update(0,[p(1)]);e.update(10,[p(1),p(2),p(3)]);assert.equal(opens,1);assert.deepEqual(e.events.at(-1),['reset']);
  const count=e.events.length;e.update(20,[p(1),p(2),p(3),p(4)]);e.update(30,[p(1)]);assert.equal(opens,1);assert.equal(e.events.length,count);
  e.update(40,[]);e.update(50,[p(1),p(2),p(3)]);assert.equal(opens,2);
 }
 const disabled=environment('trackpad',{onKeyboard:()=>assert.fail('suspended touch cannot open keyboard')});disabled.update(0,[p(1),p(2),p(3)],false);
});
test('single tap clicks left, movement is relative, and subpixel motion accumulates',()=>{
 const e=environment();e.update(0,[p(1)]);e.update(80,[]);assert.deepEqual(e.buttons(),[['button',1,true],['button',1,false]]);
 const move=environment();move.update(0,[p(2)]);move.update(20,[p(2,140,80)]);move.update(40,[]);
 assert.deepEqual(move.events,[['move',40,-20]]);
 const tiny=environment();tiny.update(0,[p(3)]);for(let i=1;i<=4;i++)tiny.update(i,[p(3,100+i*.25,100)]);
 assert.deepEqual(tiny.events,[['move',1,0]]);
});
test('two-finger tap clicks right once after both fingers lift; motion and extra fingers suppress clicks',()=>{
 const e=environment();e.update(0,[p(1)]);e.update(20,[p(1),p(2,200)]);e.update(40,[p(2,200)]);assert.equal(e.events.length,0);e.update(80,[]);
 assert.deepEqual(e.buttons(),[['button',3,true],['button',3,false]]);
 for(const count of [2,3]){const e=environment();e.update(0,Array.from({length:count},(_,i)=>p(i,100+i*50)));e.update(30,Array.from({length:count},(_,i)=>p(i,150+i*50)));e.update(50,[]);assert.equal(e.buttons().length,0);}
 const long=environment();long.update(0,[p(1)]);long.update(1000,[]);assert.equal(long.events.length,0);
});
test('quick second tap holds left through dragging and releases on lift or cancellation',()=>{
 const e=environment();e.update(0,[p(1)]);e.update(50,[]);e.update(150,[p(2,105)]);
 assert.deepEqual(e.buttons().at(-1),['button',1,true]);e.update(180,[p(2,135)]);e.update(1000,[]);
 assert.deepEqual(e.events,[['button',1,true],['button',1,false],['button',1,true],['move',30,0],['button',1,false]]);
 const cancelled=environment();cancelled.update(0,[p(1)]);cancelled.update(30,[]);cancelled.update(100,[p(2)]);cancelled.input.cancel();
 assert.deepEqual(cancelled.events.at(-1),['reset']);const n=cancelled.events.length;cancelled.update(120,[p(2,150)]);assert.equal(cancelled.events.length,n);
 cancelled.update(130,[]);cancelled.update(160,[p(3)]);cancelled.update(200,[]);assert.deepEqual(cancelled.buttons().slice(-2),[['button',1,true],['button',1,false]]);
});
test('two-finger swipes scroll naturally in both axes without mouse motion or a right click',()=>{
 const e=environment();e.update(0,[p(1,100,200),p(2,200,200)]);
 e.update(10,[p(1,100,195),p(2,200,195)]);assert.equal(e.events.length,0,'small tap jitter does not scroll');
 e.update(20,[p(2,200,160),p(1,100,160)]); // order changes are not ID changes
 e.update(30,[p(1,140,160),p(2,240,160)]);
 e.update(40,[p(1,140,200),p(2,240,200)]);e.update(50,[]);
 assert.deepEqual(e.events,[['scroll',0,-120],['scroll',-120,0],['scroll',0,120]]);
});
test('scrolling retains fractional wheel deltas and scales to the screen rather than stream resolution',()=>{
 const e=environment('trackpad',{width:640,height:360,bounds:()=>({left:0,top:0,width:2560,height:1440})});
 e.update(0,[p(1,200,400),p(2,400,400)]);e.update(10,[p(1,200,480),p(2,400,480)]);
 for(let i=1;i<=4;i++)e.update(10+i,[p(1,200,480+i*.25),p(2,400,480+i*.25)]);
 assert.deepEqual(e.events,[['scroll',0,120],['scroll',0,1]]);
});
test('contact arrival, lifting, replacement and a third finger never introduce scroll jumps or clicks',()=>{
 const e=environment();e.update(0,[p(1)]);e.update(10,[p(1),p(2,600,100)]);assert.equal(e.events.length,0);
 e.update(20,[p(1,100,140),p(2,600,140)]);assert.deepEqual(e.events,[['scroll',0,120]]);
 e.update(30,[p(1,100,400)]);e.update(40,[p(1,100,400),p(3,1000,600)]);assert.equal(e.events.length,1);
 e.update(50,[p(1,100,440),p(3,1000,640)]);assert.deepEqual(e.events.at(-1),['scroll',0,120]);
 e.update(60,[p(1),p(3),p(4)]);e.update(70,[p(1,100,400),p(3,100,400)]);e.update(80,[]);
 assert.equal(e.events.length,2,'third finger suppresses input until all contacts lift');
 const replacement=environment();replacement.update(0,[p(1),p(2)]);replacement.update(10,[p(1),p(3,600)]);
 assert.equal(replacement.events.length,0,'replacing an ID rebases without moving');
 const pinch=environment();pinch.update(0,[p(1,100),p(2,200)]);pinch.update(10,[p(1,50),p(2,250)]);pinch.update(20,[]);
 assert.equal(pinch.events.length,0,'opposite finger motion does not become a swipe or tap');
});
test('cancellation discards scroll remainders and queue failure gates the gesture until all fingers lift',()=>{
 for(const reject of [false,true]){
  const e=environment();e.update(0,[p(1),p(2)]);if(reject)e.result(-2);
  e.update(10,[p(1,100,140),p(2,100,140)]);if(!reject)e.input.cancel();
  assert.deepEqual(e.events.at(-1),['reset']);const count=e.events.length;
  e.update(20,[p(1,100,200),p(2,100,200)]);assert.equal(e.events.length,count);
  e.result(0);e.update(30,[]);e.update(40,[p(3),p(4)]);e.update(50,[]);
  assert.deepEqual(e.buttons(),[['button',3,true],['button',3,false]]);
 }
});
test('slow or distant second taps do not start a hold and adding a finger ends a drag',()=>{
 for(const [time,x] of [[400,100],[100,400]]){const e=environment();e.update(0,[p(1)]);e.update(30,[]);e.update(time,[p(2,x)]);assert.equal(e.buttons().length,2);}
 const e=environment();e.update(0,[p(1)]);e.update(30,[]);e.update(100,[p(2)]);e.update(110,[p(2),p(3,200)]);e.update(130,[]);
 assert.deepEqual(e.buttons(),[['button',1,true],['button',1,false],['button',1,true],['button',1,false]]);
});
test('direct mode keeps independent finger IDs and emits down/move/up with video-normalized positions',()=>{
 const e=environment('touchpad');e.update(0,[p(10,0,0),p(20,1280,720)]);e.update(10,[p(20,640,360),p(10,0,0)]);e.update(20,[p(10,0,0)]);e.update(30,[]);
 assert.deepEqual(e.events,[['touch',1,10,0,0],['touch',1,20,1,1],['touch',3,20,.5,.5],['touch',2,20,.5,.5],['touch',2,10,0,0]]);
});
test('direct mode respects letterboxing and clamps an active finger dragged out of the picture',()=>{
 const e=environment('touchpad',{bounds:()=>({left:0,top:0,width:1000,height:1000})});
 e.update(0,[p(1,100,10)]);e.update(10,[p(1,500,500)]);e.update(20,[]);assert.equal(e.events.length,0);
 e.update(30,[p(2,500,500)]);e.update(40,[p(2,1500,0)]);e.update(50,[]);
 assert.deepEqual(e.events,[['touch',1,2,.5,.5],['touch',3,2,1,0],['touch',2,2,1,0]]);
});
test('blur/dialog cancellation clears queued taps and contacts and gates held fingers until neutral',()=>{
 const e=environment('touchpad');e.update(0,[p(1)]);e.update(10,[p(1)],false);assert.deepEqual(e.events.at(-1),['reset']);
 const n=e.events.length;e.update(20,[p(1)],true);assert.equal(e.events.length,n);e.update(30,[]);e.update(40,[p(1)]);assert.equal(e.events.at(-1)[1],1);
 e.input.close();const closed=e.events.length;e.update(50,[p(2)]);assert.equal(e.events.length,closed);
 const click=environment();click.update(0,[p(1)]);click.update(30,[]);click.input.cancel();assert.deepEqual(click.events.at(-1),['reset'],'even a completed but unpumped click must be cancelled');
 const held=environment('touchpad',{startBlocked:true});held.update(0,[p(1)]);held.update(10,[]);assert.equal(held.events.length,0);held.update(20,[p(2)]);assert.equal(held.events.length,1);
});
test('unsupported hosts and full queues reset input without repeated error notices or automatic mouse fallback',()=>{
 for(const failure of [-5501,-2,-1]){
  const e=environment('touchpad');e.result(failure);e.update(0,[p(1)]);assert.equal(e.events.filter(e=>e[0]==='reset').length,1);assert.equal(e.errors.length,failure===-1?0:1);
  e.update(10,[p(1,200)]);assert.equal(e.events.length,2);e.update(20,[]);e.update(30,[p(2)]);assert(e.errors.length<=1);assert.equal(e.buttons().length,0);
 }
});
test('malformed snapshots and a replaced primary finger cancel instead of generating clicks',()=>{
 for(const points of [[p(1),p(1)],[p(1,NaN)],[p(-1)],[...Array.from({length:17},(_,i)=>p(i))]]){
  const e=environment();e.update(0,[p(5)]);e.update(10,points);e.update(20,[]);assert.equal(e.buttons().length,0);
 }
 const e=environment();e.update(0,[p(1)]);e.update(10,[p(2)]);e.update(30,[]);assert.equal(e.buttons().length,0);
});
test('native touchscreen uses bounded owned SDK state, stable IDs, End flags and checked Result returns',()=>{
 const memory=new DataView(new ArrayBuffer(2048));let freed=0,attributes=0,error=false,corrupt=false,count=1;
 const scope={MoonlightNative:{available:true,create:()=>({resolveNativeSymbol:name=>{assert.match(name,/hid6detail19GetTouchScreenStateILm16/);return 99n;}})},
  malloc:bytes=>{assert.equal(bytes,688);return 128n;},free:p=>{assert.equal(p,128n);freed++;},
  write64:(p,v)=>memory.setBigUint64(Number(p),v,true),read64:p=>memory.getBigUint64(Number(p),true),read32:p=>BigInt(memory.getUint32(Number(p),true)),
  call_rop:(fn,out)=>{assert.equal(fn,99n);if(error)return 1n;const at=Number(out);memory.setUint32(at+8,count,true);memory.setUint32(at+16+8,attributes,true);memory.setUint32(at+16+12,42,true);memory.setUint32(at+16+16,639,true);memory.setUint32(at+16+20,359,true);if(corrupt)memory.setBigUint64(at+656,0n,true);return 0n;}};
 const native=load(scope).createNative();const points=native.poll();assert.equal(points.length,1);assert.equal(points[0].id,42);assert.equal(points[0].x,639/1279);assert.equal(points[0].y,359/719);
 attributes=2;assert.equal(native.poll().length,0);attributes=0;count=17;assert.throws(()=>native.poll(),/count/);count=1;error=true;assert.throws(()=>native.poll(),/read failed/);error=false;corrupt=true;assert.throws(()=>native.poll(),/buffer/);
 native.close();native.close();assert.equal(freed,1);assert.equal(native.poll().length,0);assert.equal(load().createNative(),null);
});
