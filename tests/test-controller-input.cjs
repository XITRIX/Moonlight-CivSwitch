const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app/src/streaming/controller-input.js','utf8');
function load(scope={}){const context=vm.createContext({window:{},...scope});vm.runInContext(source,context);return context.window.MoonlightControllerInput;}
const input=load();
const list=x=>Array.from(x.state);
test('native buttons follow standard positions and keep B available during play',()=>{
 const expected=[0x2000,0x1000,0x8000,0x4000,0x40,0x80,0x100,0x200,0,0,0x10,0x20,4,1,8,2];
 expected.forEach((flag,bit)=>{const value=input.fromNpad(1<<bit,0,0,0,0);assert.equal(value.state[0],flag);assert.equal(value.exit,false);});
 assert.equal(input.fromNpad(1<<8,0,0,0,0).state[1],255);assert.equal(input.fromNpad(1<<9,0,0,0,0).state[2],255);
 assert.equal(input.fromNpad(0xc00,0,0,0,0).exit,true);
 assert.equal(input.fromNpad((1<<16)|(1<<17),0,0,0,0).state[0],0,'stick direction pseudo-buttons are not D-pad presses');
});
test('both native sticks preserve orientation, dead zone and bounds',()=>{
 assert.deepEqual(list(input.fromNpad(0,-32768,32767,32767,-32768)),[0,0,0,-32767,32767,32767,-32767]);
 assert.deepEqual(list(input.fromNpad(0,100,-100,NaN,Infinity)),[0,0,0,0,0,0,0]);
});
test('browser and native physical layouts agree, including triggers and exit chord',()=>{
 const pad={mapping:'standard',connected:true,buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[1,-1,-1,1]};
 pad.buttons[0].pressed=true;pad.buttons[6].value=.5;pad.buttons[7].value=2;
 assert.deepEqual(list(input.fromBrowser(pad)),[0x1000,128,255,32767,32767,-32767,-32767]);
 pad.buttons[8].pressed=true;assert.equal(input.fromBrowser(pad).exit,false);pad.buttons[9].pressed=true;assert.equal(input.fromBrowser(pad).exit,true);
 pad.connected=false;assert.equal(input.fromBrowser(pad),null);pad.connected=true;pad.mapping='';assert.equal(input.fromBrowser(pad),null);
});
test('native adapter polls connected styles, handles disconnects, and frees only its buffers',()=>{
 const memory=new Map(),owned=new Set(),addresses=new Map();let next=0x1000n,connected=true;
 const write=(p,v,n=8)=>{for(let i=0;i<n;i++)memory.set(p+BigInt(i),Number((BigInt(v)>>BigInt(8*i))&255n));};
 const read=(p,n=8)=>{let v=0n;for(let i=n-1;i>=0;i--)v=(v<<8n)|BigInt(memory.get(p+BigInt(i))||0);return v;};
 const window={MoonlightNative:{available:true,create:()=>({resolveNativeSymbol:name=>{const p=BigInt(addresses.size+1);addresses.set(p,name);return p;}})}};
 const adapter=load({window,malloc:n=>{const p=next;next+=BigInt(n+16);owned.add(p);return p;},free:p=>assert(owned.delete(p)),write32:(p,v)=>write(p,v,4),read32:p=>read(p,4),read64:p=>read(p),call_rop:(p,...args)=>{
  const name=addresses.get(p);assert(name);
  if(name.includes('GetNpadStyleSet')){write(args[0],connected&&read(args[1],4)===32n?2n:0n,4);return 0n;}
  assert(name.includes('GetNpadStates'));assert.equal(args[2],1n);
  write(args[0],1n,4);const out=args[1];write(out+8n,2n);write(out+16n,32767n,4);write(out+32n,connected?1n:0n,4);return 0n;
 }}).createNative();
 assert.deepEqual(list(adapter.poll()),[0x1000,0,0,32767,0,0,0]);connected=false;assert.equal(adapter.poll(),null);
 adapter.close();adapter.close();assert.equal(owned.size,0);assert.equal(adapter.poll(),null);
});
