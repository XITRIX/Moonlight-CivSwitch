const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('old renderer preferences migrate to native codec preferences and disappear on save',()=>{
 const g={};g.window=g;vm.runInContext(fs.readFileSync('app/src/storage/stream-settings.js','utf8'),vm.createContext(g));
 let data=JSON.stringify({version:1,mode:{...g.MoonlightSettings.defaults(),renderer:'gameface'}}),commits=0;
 const store=g.MoonlightSettings.create({read:()=>data,write:v=>data=v,commit:()=>commits++}),mode=store.load();assert.equal(mode.renderer,undefined);assert.equal(mode.codec,'h264');store.save(mode);assert(!data.includes('renderer'));assert.equal(commits,1);
});
test('resident mounting refuses an incompatible owner before attaching a view',async()=>{
 const g={call_rop(){},MoonlightNative:{available:true},__civhomebrewCore:{},CivNanoVGSession:{api:1,current:{api:1,stats:{errors:[]},renderer:{owner:{}}}}};g.window=g;vm.runInContext(fs.readFileSync('app/src/ui/native-ui.js','utf8'),vm.createContext(g));await assert.rejects(g.MoonlightNativeUi.mount({}),/Update the native Launcher/);
});

test('the default stream selects the native video presenter with no renderer preference',async()=>{
 let nativeCreates=0,closed=0,ioClosed=false,state=0,client;
 const core={HEAPU8:new Uint8Array(1024),_malloc:()=>128,_free(){},lengthBytesUTF8:s=>s.length,stringToUTF8(){},UTF8ToString:()=>'',_LiGetLaunchUrlQueryParameters:()=>0,
  _ml_session_start:()=>{state=2;return 0;},_ml_session_state:()=>state,_ml_runtime_tasks:()=>0,_ml_session_video_frames:()=>1,_ml_session_stop:()=>{state=0;},_ml_runtime_pump(){}};
 const g={console,setTimeout,clearTimeout,performance,Uint8Array,__moonlightStreamFactory:async()=>core,MoonlightNative:{create:()=>({})},
  MoonlightTelemetry:{now:()=>performance.now(),create:()=>({sample:()=>({})}),readCore:()=>null},
  MoonlightStreamIO:{create:()=>({stats:{},interrupt(){},close(){ioClosed=true;}})},
  MoonlightStreamMedia:{create(){throw Error('legacy video output selected');}},
  MoonlightNativeVideo:{createMedia:async(io,runtime,options)=>{nativeCreates++;assert.equal(runtime,core);assert.equal(options.mode.renderer,undefined);return {drainVideo(){},finishVideo(){},drainAudio(){},stats:()=>({}),close(){closed++;}};}},
  MoonlightSessionProtocol:{create:()=>({launch:async()=>({host:'host',version:'7',url:'rtsp://host',key:new Uint8Array(16),keyId:1,codecSupport:1})})}};g.window=g;
 vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),vm.createContext(g));
 client=g.MoonlightStreamClient.create({host:'host',app:{id:1},mode:{width:1280,height:720,fps:60,bitrate:20000,codec:'h264'},onStats:()=>client.stop()});
 const result=await client.start();assert.equal(result.error,null);assert.equal(nativeCreates,1);assert.equal(closed,1);assert.equal(ioClosed,true);
});

test('the native adapter preserves the SDK blocker without requiring a renderer',async()=>{
 const blocker={blocked:true,session:null,close(){throw Error('Blocker must remain visible');}};
 const g={call_rop(){},MoonlightNative:{available:true},CivHomebrewSDK:{app:{mount:async()=>blocker}}};g.window=g;
 vm.runInContext(fs.readFileSync('app/src/ui/native-ui.js','utf8'),vm.createContext(g));
 assert.equal(await g.MoonlightNativeUi.mount({}),blocker);
});

test('pairing keyboard borrows its active SDK view and forwards asynchronous failure handling',()=>{
 const root={},view={session:{renderer:{owner:{}}}},lease={close(){}},errors=[];let received;
 const g={CivSDKKeyboard:{open(options){received=options;return lease;}}};g.window=g;
 vm.runInContext(fs.readFileSync('app/src/ui/native-ui.js','utf8'),vm.createContext(g));
 const onError=e=>errors.push(e);
 assert.equal(g.MoonlightNativeUi.keyboard(root,view,onError),lease);assert.equal(received.root,root);assert.equal(received.view,view);assert.equal(received.session,view.session);
 const failure=Error('reader failed');received.error(failure);assert.deepEqual(errors,[failure]);
 assert.equal(g.MoonlightNativeUi.keyboard(root,null,onError),null);assert.equal(g.MoonlightNativeUi.keyboard(root,{session:{renderer:{}}},onError),null);
 delete g.CivSDKKeyboard;assert.throws(()=>g.MoonlightNativeUi.keyboard(root,view,onError),/Update Launcher.*restart Civ VII/);
});
