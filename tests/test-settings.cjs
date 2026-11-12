const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('app/src/storage/stream-settings.js','utf8'),context);
const settings=context.MoonlightSettings,plain=v=>JSON.parse(JSON.stringify(v));
test('stream settings survive a new store and reject unsupported stream modes',()=>{
 let file=null,commits=0;
 const adapter={read:()=>file,write:text=>file=text,commit:()=>commits++};
 const store=settings.create(adapter),mode={width:960,height:540,fps:60,bitrate:8000,codec:"h264",showStats:true,videoPacing:"smooth",rumble:true,touchMode:"trackpad",mouse:{speed:34,swapButtons:false,invertScroll:false}};
 assert.deepEqual(plain(store.load()),{width:1280,height:720,fps:60,bitrate:20000,codec:"h264",showStats:false,videoPacing:"smooth",rumble:true,touchMode:"trackpad",mouse:{speed:34,swapButtons:false,invertScroll:false}});
 file=JSON.stringify({version:1,mode:{width:960,height:540,fps:60,bitrate:8000}});assert.equal(store.load().rumble,true,'older settings enable rumble by default');
 store.save(mode);assert.equal(commits,1);assert.deepEqual(plain(settings.create(adapter).load()),mode);
 store.save({...mode,touchMode:'touchpad'});assert.equal(settings.create(adapter).load().touchMode,'touchpad');
 store.save({...mode,rumble:false});assert.equal(settings.create(adapter).load().rumble,false);
 store.save({...mode,videoPacing:'latency'});assert.equal(settings.create(adapter).load().videoPacing,'latency');store.save(mode);
 for(const bitrate of [10000,15000,20000,25000,30000,40000,50000,60000,70000,80000]){store.save({...mode,width:1920,height:1080,bitrate});assert.equal(settings.create(adapter).load().bitrate,bitrate);}store.save(mode);
 for(const invalid of [{...mode,width:2560,height:1440},{...mode,bitrate:80001},{...mode,bitrate:'8000'},{...mode,showStats:'yes'},{...mode,videoPacing:'unbounded'},{...mode,rumble:'on'},{...mode,touchMode:'mouse'}])assert.throws(()=>store.save(invalid),/Invalid/);
 assert.deepEqual(plain(store.load()),mode);
 for(const text of ['{',JSON.stringify({version:2,mode}),JSON.stringify({version:1,mode:{...mode,fps:0}})]){file=text;assert.throws(()=>store.load());assert.equal(file,text);}
});
test('save failures are reported so the settings screen can remain open',()=>{
 for(const stage of ['write','commit','readback']){
  const store=settings.create({read:()=>null,write:()=>{if(stage==='write')throw Error('disk full');},commit:()=>{if(stage==='commit')throw Error('commit failed');}});
  assert.throws(()=>store.save(settings.defaults()),/disk full|commit failed|verified/);
 }
 const mode=settings.defaults();mode.fps=30;assert.equal(settings.defaults().fps,60);
});
test('mouse preferences are migrated, validated, detached, and retained through other stream settings',()=>{
 const mode=settings.defaults();assert.deepEqual(plain(mode.mouse),{speed:34,swapButtons:false,invertScroll:false});
 assert.deepEqual(plain(settings.validate({...mode,mouse:undefined}).mouse),plain(mode.mouse));
 for(const mouse of [null,{speed:-1,swapButtons:false,invertScroll:false},{speed:101,swapButtons:false,invertScroll:false},{speed:34.5,swapButtons:false,invertScroll:false},{speed:34,swapButtons:1,invertScroll:false},{speed:34,swapButtons:false,invertScroll:'yes'}])assert.throws(()=>settings.validate({...mode,mouse}),/mouse settings/);
 const custom={speed:100,swapButtons:true,invertScroll:true},value=settings.validate({...mode,mouse:custom});custom.speed=0;assert.equal(value.mouse.speed,100);
 assert.deepEqual(plain(settings.validate({...value,touchMode:'touchpad'}).mouse),{speed:100,swapButtons:true,invertScroll:true});
});
