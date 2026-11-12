/* Actual NanoVG geometry and raster shader on Chrome's software GPU.
 * Pixel output here is host evidence; device display handoff is a separate test. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {open,sleep}=require('../tools/civapps-native-ui/chrome.cjs');
(async()=>{
 const browser=await open(),{evaluate,call,until}=browser,dir=path.resolve('build/native-ui');fs.mkdirSync(dir,{recursive:true});
 try{
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1.5,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(path.resolve('app/index.html')).href+'?nativeUi=1'});
  await until('window.CivNanoVGSession?.current?.active?.ui?.stats.frames>0');
  const owner=await evaluate('CivNanoVGSession.current.stats.binds');assert.equal(owner,1);
  async function capture(name){await sleep(130);const errors=await evaluate('({session:CivNanoVGSession.current.stats.errors,view:CivNanoVGSession.current.active.ui.stats.error})');assert.deepEqual(errors,{session:[],view:''});const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(shot.data,'base64'));}
  await capture('hosts');
  await evaluate(`document.getElementById('moonlight-open-settings').click();true`);await capture('settings');
  // A fixed aspect ratio keeps the same density at every pixel resolution.
  // All settings, helper copy and Back must fit together without a hidden row.
  await evaluate('window.__settingsTextRange=document.createRange;document.createRange=undefined;CivNanoVGSession.current.active.ui.resetLayoutCache();true');
  let heading720;
  for(const [width,height] of [[960,540],[1280,720],[1920,1080],[2560,1440],[1024,768],[2560,1080]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(140);
   const layout=await evaluate(`(()=>{const p=document.getElementById('moonlight-settings-screen'),r=p.getBoundingClientRect(),h=document.querySelector('#moonlight-settings-screen h2');return {panel:[r.left,r.top,r.right,r.bottom],scroll:p.scrollHeight-p.clientHeight,heading:parseFloat(getComputedStyle(h).fontSize),controls:Array.from(p.querySelectorAll('button'),n=>{const r=n.getBoundingClientRect();return {id:n.id,rect:[r.left,r.top,r.right,r.bottom],visible:n.offsetHeight>0};}).filter(n=>n.visible)};})()`);
   assert(layout.panel[0]>=0&&layout.panel[1]>=0&&layout.panel[2]<=width&&layout.panel[3]<=height,JSON.stringify({width,height,layout}));
   assert(layout.scroll<=2,JSON.stringify({width,height,layout}));
   assert.equal(layout.controls.length,9);
   for(const row of layout.controls)assert(row.rect[1]>=layout.panel[1]&&row.rect[3]<=layout.panel[3]+1,JSON.stringify(row));
   const columns=await evaluate(`(()=>{const ui=CivNanoVGSession.current.active.ui,scale=1920/innerWidth;return Array.from(document.querySelectorAll('#moonlight-settings-screen button[id^=moonlight-settings-]')).filter(n=>n.firstElementChild).map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n),label=n.firstElementChild,value=n.lastElementChild,c=ui.scene.commands.find(c=>c.kind==='text'&&c.text===label.textContent),v=value.id&&ui.scene.commands.find(c=>c.kind==='text'&&c.id===value.id);return {id:n.id,left:c?c.x:null,expectedLeft:(r.left+parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth))*scale,right:v?v.x+CivNanoVGSession.current.geometry.measure(v.text,v.size,v.font):null,expectedRight:(r.right-parseFloat(s.paddingRight)-parseFloat(s.borderRightWidth))*scale};});})()`);
   assert.equal(columns.length,8);
   for(const row of columns){assert.notEqual(row.left,null,JSON.stringify({width,height,row}));assert(Math.abs(row.left-row.expectedLeft)<1,JSON.stringify({width,height,row}));if(row.right!==null)assert(Math.abs(row.right-row.expectedRight)<1,JSON.stringify({width,height,row}));}
   if(width===1280){heading720=layout.heading;assert(layout.heading<30,'screen typography is smaller than the old 36px title');}
   if(width===1920)assert(Math.abs(layout.heading/heading720-1.5)<.01,'1080p keeps 720p proportions');
   await evaluate("document.getElementById('moonlight-settings-bitrate').click();true");await sleep(100);
   const popup=await evaluate("(()=>{const r=document.getElementById('moonlight-bitrate-options').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];})()");
   assert(popup[0]>=0&&popup[1]>=0&&popup[2]<=width&&popup[3]<=height,JSON.stringify({width,height,popup}));
   const popupPaint=await evaluate(`(()=>{const session=CivNanoVGSession.current,commands=session.active.ui.scene.commands,n=document.getElementById('moonlight-bitrate-option-80000'),r=n.getBoundingClientRect(),bytes=session.renderer.read(),x=Math.floor((r.left+6)*1920/innerWidth),y=Math.floor((r.top+r.height/2)*1080/innerHeight);return {option:commands.findIndex(c=>c.id===n.id&&c.kind==='rect'),lastRow:commands.findIndex(c=>c.id==='moonlight-settings-codec'&&c.kind==='rect'),pixel:Array.from(bytes.slice((y*1920+x)*4,(y*1920+x)*4+4))};})()`);
   assert(popupPaint.option>popupPaint.lastRow,'bitrate choices paint above the later settings rows: '+JSON.stringify(popupPaint));
   assert.deepEqual(popupPaint.pixel,[12,20,35,255],'bitrate option background is visible in native GPU output');
   const optionAlignment=await evaluate(`(()=>{const session=CivNanoVGSession.current;return Array.from(document.querySelectorAll('#moonlight-bitrate-options [role=option]'),n=>{const r=n.getBoundingClientRect(),c=session.active.ui.scene.commands.find(c=>c.kind==='text'&&c.id===n.id),m=session.geometry.metrics(c.size,c.font);return {id:n.id,expected:(r.top+r.bottom)/2*1080/innerHeight,actual:c.baseline-(m[0]+m[1])/2};});})()`);
   for(const option of optionAlignment)assert(Math.abs(option.actual-option.expected)<1,'bitrate label is vertically centered without DOM Range: '+JSON.stringify(option));
   if(width===1280)await capture('settings-bitrate-options');
   await evaluate("document.getElementById('moonlight-bitrate-option-20000').click();true");
   // Changing short/long values and focus must never move the label column.
   for(const id of ['touchMode','resolution','showStats','codec']){
    await evaluate(`document.getElementById('moonlight-settings-${id}').click();true`);await sleep(130);
    const starts=await evaluate(`CivNanoVGSession.current.active.ui.scene.commands.filter(c=>c.kind==='text'&&/-label$/.test(c.id||'')).map(c=>({id:c.id,x:c.x}))`);
    assert.equal(starts.length,8);for(const label of starts){const before=columns.find(c=>c.id+'-label'===label.id);assert(Math.abs(label.x-before.left)<1,JSON.stringify({id,label,before}));}
   }
   if(width===1920){await capture('settings-1080p');assert.equal(await evaluate(`CivNanoVGSession.current.active.ui.scene.commands.filter(c=>c.kind==='text'&&c.id==='moonlight-ui-hints').map(c=>c.text).join(' ').includes('B: Back')`),true,'native footer preserves the full Back hint');}
  }
  await evaluate('document.createRange=__settingsTextRange;delete window.__settingsTextRange;CivNanoVGSession.current.active.ui.resetLayoutCache();true');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1.5,mobile:false});await sleep(140);
  assert.equal(await evaluate('document.getElementById("moonlight-settings-renderer")'),null);
  assert.equal(await evaluate('/gameface/i.test(document.body.innerText)'),false);
  await evaluate(`document.getElementById('moonlight-settings-back').click();document.getElementById('moonlight-pair-new-host').click();document.getElementById('moonlight-host').value='192.168.1.23:47989';document.getElementById('moonlight-host').dispatchEvent(new Event('input',{bubbles:true}));true`);
  await capture('pair');assert.equal(await evaluate('CivNanoVGSession.current.active.ui.scene.commands.some(c=>c.kind==="text"&&c.text.includes("192.168.1.23"))'),true,'native input includes its value');
  // The console lacks text Range: button alignment must come from explicit flex layout.
  await evaluate(`document.getElementById('moonlight-pair-screen').style.display='none';window.__originalGames=document.getElementById('moonlight-games-screen');__originalGames.id='moonlight-games-screen-original';window.__gamesFixture=MoonlightGames.create({parent:document.getElementById('moonlight-simple-ui'),onBack(){},onRefresh(){},onSettings(){},onLaunch(){}});__gamesFixture.show('Gaming PC');__gamesFixture.setApps([{id:1,title:'Desktop'}],null,'fixture',0);window.__textRange=document.createRange;document.createRange=undefined;CivNanoVGSession.current.active.ui.resetLayoutCache();true`);
  await capture('games-buttons');
  const alignment=await evaluate(`['refresh','settings','back'].map(name=>{var n=document.querySelector('#moonlight-games-screen #moonlight-games-'+name),r=n.getBoundingClientRect(),c=CivNanoVGSession.current.active.ui.scene.commands.find(c=>c.kind==='text'&&c.id===n.id),m=CivNanoVGSession.current.geometry.metrics(c.size,c.font);return {name,expected:(r.top+r.bottom)*.75,actual:c.baseline-(m[0]+m[1])/2};})`);
  for(const row of alignment)assert(Math.abs(row.actual-row.expected)<1,JSON.stringify(row));
  await evaluate(`__gamesFixture.setApps([{id:1,title:'Desktop'}],async()=>({url:'data:image/png;base64,'+CivNanoVGAssets['button-a.png'],width:38,height:38,bytes:1000}),'native-cover-fixture',0);true`);
  await sleep(300);
  const nativeCover=await evaluate(`(()=>{var n=document.querySelector('#moonlight-games-screen canvas[data-civ-pixels]'),source=n&&n.getAttribute('data-civ-pixels');return {source,images:document.querySelectorAll('#moonlight-games-screen #moonlight-game-list img').length,painted:CivNanoVGSession.current.active.ui.scene.commands.some(c=>c.kind==='image'&&c.source===source)};})()`);
  assert(nativeCover.source&&nativeCover.source.length<64);assert.equal(nativeCover.images,0,'native covers do not enter the Gameface image decoder');assert.equal(nativeCover.painted,true);
  await evaluate(`__gamesFixture.setApps(Array.from({length:10},(_,i)=>({id:i+1,title:'Application '+(i+1)})),null,'fixture',0);__gamesFixture.move('right');true`);
  for(const [width,height,count] of [[1280,720,4],[1920,1080,4],[1920,1440,8]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(160);
   const grid=await evaluate(`(()=>{var p=document.getElementById('moonlight-games-screen'),r=p.getBoundingClientRect();return {rect:[r.left,r.top,r.right,r.bottom],count:p.querySelectorAll('[data-app-id]').length,selected:p.querySelector('[data-selected=true][data-app-id]')?.getAttribute('data-app-id'),border:getComputedStyle(p.querySelector('[data-selected=true][data-app-id]')).borderColor};})()`);
   assert.equal(grid.count,count);assert.equal(grid.selected,'2');assert.equal(grid.border,'rgb(148, 198, 255)');
   assert(grid.rect[0]>=0&&grid.rect[1]>=0&&grid.rect[2]<=width&&grid.rect[3]<=height,JSON.stringify(grid));
   if(height===1080)await capture('games-1080p');
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1.5,mobile:false});await sleep(140);
  await evaluate(`(async()=>{await __gamesFixture.destroy();document.getElementById('moonlight-games-screen').remove();__originalGames.id='moonlight-games-screen';document.createRange=__textRange;CivNanoVGSession.current.active.ui.resetLayoutCache();})()`);
  // Exercise the real stream controls while video is represented by a transparent surface.
  await evaluate(`window.__client=MoonlightStreamClient.create;window.__touchNative=MoonlightTouchInput.createNative;window.__touchPoints=[];window.__mouseMoves=0;
   MoonlightTouchInput.createNative=()=>({poll:()=>__touchPoints,close(){}});
   MoonlightStreamClient.create=options=>({start:()=>new Promise(r=>{window.__stop=r;window.__videoPresented=options.onPresented;options.onPresented();}),stop:()=>__stop({stats:{}}),gamepad(){return 0;},key(){return 0;},mouseMove(){__mouseMoves++;return 0;},resetPointer(){},resetKeys(){}});
   document.getElementById('moonlight-pair-screen').style.display='none';document.getElementById('moonlight-simple-ui').style.backgroundColor='transparent';
   window.__screen=MoonlightStreamScreen.create({parent:document.getElementById('moonlight-simple-ui'),log(){},onBack(){}});window.__stream=__screen.show('host',{id:1,title:'Desktop'},MoonlightSettings.defaults(),'Gaming PC');
   true`);
  await sleep(300);
  await evaluate(`__screen.poll();window.__streamKey=document.getElementById('moonlight-simple-ui').__civNanoVGSceneKey();window.__streamSnapshots=CivNanoVGSession.current.active.ui.stats.snapshots;
   Object.defineProperty(document.getElementById('moonlight-simple-ui'),'innerHTML',{configurable:true,get(){throw Error('Streaming serialized hidden application markup');}});
   for(var i=0;i<120;i++){__touchPoints=[{id:1,x:.2+i*.001,y:.4}];__screen.poll();__screen.action('nav-move',0,0,0);__videoPresented();}
   __touchPoints=[];__screen.poll();CivNanoVGPrototype.invalidate();true`);
  await sleep(200);
  const inputCache=await evaluate(`({moves:__mouseMoves,sameKey:__streamKey===document.getElementById('moonlight-simple-ui').__civNanoVGSceneKey(),snapshots:CivNanoVGSession.current.active.ui.stats.snapshots-__streamSnapshots,error:CivNanoVGSession.current.active.ui.stats.error})`);
  assert(inputCache.moves>50,'touch movements still reach the remote pointer');assert.equal(inputCache.sameKey,true);assert.equal(inputCache.snapshots,0);assert.equal(inputCache.error,'');
  await evaluate(`delete document.getElementById('moonlight-simple-ui').innerHTML;__screen.key({key:'Escape',repeat:false},true);true`);
  await capture('stream-menu');
  const samples=await evaluate(`(()=>{var r=CivNanoVGSession.current.renderer,b=r.read(),pixel=(x,y)=>Array.from(b.slice((y*1920+x)*4,(y*1920+x)*4+4));return {outside:pixel(1900,500),inside:pixel(100,500)};})()`);
  assert(samples.outside[3]>0&&samples.outside[3]<255,'drawer backdrop preserves video alpha');assert(samples.inside[3]>0);
  await evaluate(`document.getElementById('moonlight-stream-menu-more').click();document.getElementById('moonlight-stream-menu-keyboard').click();true`);await capture('stream-keyboard');
  for(const [width,height] of [[1280,720],[1920,1080]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(140);
   const keyboard=await evaluate(`(()=>{var panel=Array.from(document.querySelectorAll('#moonlight-stream-keyboard-panel')).find(n=>n.offsetWidth>0),p=panel.getBoundingClientRect(),k=panel.querySelector('[data-key=KeyQ]').getBoundingClientRect();return {left:p.left,right:p.right,bottom:p.bottom,keyHeight:k.height};})()`);
   assert.equal(keyboard.left,0);assert.equal(keyboard.right,width);assert.equal(keyboard.bottom,height);assert(Math.abs(keyboard.keyHeight-48*height/720)<1,'keyboard retains original key size');
  }
  await capture('stream-keyboard-full-width');
  await evaluate('(async()=>{await __screen.destroy();MoonlightStreamClient.create=__client;MoonlightTouchInput.createNative=__touchNative;await __moonlightSimpleUI.close();})()');
  assert.equal(await evaluate('CivNanoVGSession.current.active'),null);assert.equal(await evaluate('!!CivNanoVGSession.current.renderer'),true);
  await evaluate('CivNanoVGSession.current.close()');
  console.log('Native UI browser passed: actual NanoVG Hosts/settings/input/menu/keyboard, transparent video surface and retained owner; images in '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
