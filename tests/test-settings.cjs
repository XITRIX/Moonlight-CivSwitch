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
 const store=settings.create(adapter),mode={width:960,height:540,fps:60,bitrate:8000,showStats:true};
 assert.deepEqual(plain(store.load()),{width:1280,height:720,fps:30,bitrate:5000,showStats:false});
 store.save(mode);assert.equal(commits,1);assert.deepEqual(plain(settings.create(adapter).load()),mode);
 for(const invalid of [{...mode,width:1920,height:1080},{...mode,fps:120},{...mode,bitrate:20000},{...mode,bitrate:'8000'},{...mode,showStats:'yes'}])assert.throws(()=>store.save(invalid),/Invalid/);
 assert.deepEqual(plain(store.load()),mode);
 for(const text of ['{',JSON.stringify({version:2,mode}),JSON.stringify({version:1,mode:{...mode,fps:0}})]){file=text;assert.throws(()=>store.load());assert.equal(file,text);}
});
test('save failures are reported so the settings screen can remain open',()=>{
 for(const stage of ['write','commit','readback']){
  const store=settings.create({read:()=>null,write:()=>{if(stage==='write')throw Error('disk full');},commit:()=>{if(stage==='commit')throw Error('commit failed');}});
  assert.throws(()=>store.save(settings.defaults()),/disk full|commit failed|verified/);
 }
 const mode=settings.defaults();mode.fps=60;assert.equal(settings.defaults().fps,30);
});
