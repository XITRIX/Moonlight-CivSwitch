const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(){
 const scope={};scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/ui/stream-keyboard.js','utf8'),scope);
 const api=scope.MoonlightStreamKeyboard,events=[];let failure=0,resets=0;
 const keys=api.createKeys({key:(...args)=>{events.push(args);return failure;},reset:()=>resets++,onError:()=>events.push(['error'])});
 return {api,keys,events,key:id=>api.byId.get(id),failure:value=>failure=value,resets:()=>resets};
}
test('English layout provides six complete rows, function keys, punctuation, both modifiers and arrows',()=>{
 const e=environment();assert.equal(e.api.rows.length,6);
 for(const name of ['Escape','F1','F12','Delete','Digit0','Backspace','Tab','CapsLock','Enter','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight','Space','ArrowLeft','ArrowUp','ArrowDown','ArrowRight','Backslash','Quote'])assert(e.key(name),name);
 for(const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')assert.equal(e.key('Key'+c).code,c.charCodeAt(0));
 assert.equal(e.key('Digit2').shift,'@');assert.equal(e.key('Quote').shift,'"');assert.equal(e.key('Backslash').shift,'|');
 assert(e.api.rows.every(row=>row.reduce((n,k)=>n+k.width,0)<=15));
});
test('simultaneous contacts send modifiers first and keep several ordinary keys held independently',()=>{
 const e=environment(),k=e.key;
 assert(e.keys.set('touch',[k('KeyC'),k('ShiftLeft'),k('ControlLeft'),k('KeyV')]));
 assert.deepEqual(e.events.map(e=>e.slice(0,2)),[[160,true],[162,true],[67,true],[86,true]]);
 assert.equal(e.events[2][2],3);assert.equal(e.events[3][2],3);
 e.events.length=0;e.keys.set('touch',[k('KeyC'),k('ControlLeft')]);
 assert.deepEqual(e.events.map(e=>e.slice(0,2)),[[86,false],[160,false]]);assert(e.keys.pressed(67));assert(e.keys.pressed(162));
 e.events.length=0;e.keys.clear('touch');assert.deepEqual(e.events.map(e=>e.slice(0,2)),[[67,false],[162,false]]);
});
test('key owners and duplicate fingers do not release a key still held elsewhere or repeat unchanged snapshots',()=>{
 const e=environment(),c=e.key('KeyC');let changes=0;e.keys.subscribe(()=>changes++);
 e.keys.set('touch',[c,c]);e.keys.set('physical:67',[c]);e.keys.set('touch',[c]);e.keys.set('touch',[c]);
 assert.deepEqual(e.events,[[67,true,0]]);const before=changes;e.keys.set('touch',[c]);assert.equal(changes,before);
 e.keys.clear('touch');assert.deepEqual(e.events,[[67,true,0]]);e.keys.clear('physical:67');assert.deepEqual(e.events.at(-1),[67,false,0]);
});
test('Ctrl+Alt+Delete and Win+R retain modifier and extended-key flags',()=>{
 const e=environment(),k=e.key;e.keys.set('touch',[k('Delete'),k('AltRight'),k('ControlLeft')]);
 assert.deepEqual(e.events.map(e=>e.slice(0,2)),[[165,true],[162,true],[46,true]]);assert.equal(e.events.at(-1)[2],2|4|16);
 e.keys.clear('touch');e.events.length=0;e.keys.set('touch',[k('KeyR'),k('MetaLeft')]);assert.deepEqual(e.events,[[91,true,16],[82,true,8]]);
});
test('physical and virtual modifiers combine; Caps changes once on its key-down edge',()=>{
 const e=environment(),k=e.key;e.keys.set('touch',[k('ShiftLeft')]);
 e.keys.set('physical:67',[{...k('KeyC'),extra:2}]);assert.equal(e.events.at(-1)[2],3);
 e.keys.clear('physical:67',0);assert.deepEqual(e.events.at(-1),[67,false,1]);
 e.keys.set('touch',[k('CapsLock')]);assert.equal(e.keys.caps(),true);e.keys.set('touch',[k('CapsLock')]);assert.equal(e.keys.caps(),true);
 e.keys.clear('touch');e.keys.set('touch',[k('CapsLock')]);assert.equal(e.keys.caps(),false);
});
test('rejected press or release resets the native key ledger and clears all local owners',()=>{
 for(const onRelease of [false,true]){
  const e=environment(),k=e.key;if(onRelease)e.keys.set('touch',[k('ControlLeft'),k('KeyC')]);
  e.failure(-2);assert.equal(e.keys.set('touch',onRelease?[]:[k('ControlLeft'),k('KeyC')]),false);
  assert.equal(e.resets(),1);assert.equal(e.keys.modifiers(),0);assert.equal(e.keys.pressed(67),false);
  e.failure(0);e.events.length=0;e.keys.set('touch',[k('KeyC')]);assert.deepEqual(e.events,[[67,true,0]]);
 }
});
