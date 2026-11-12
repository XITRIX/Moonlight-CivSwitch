/* Installed apps: native first frames, synthetic input and returns. No component writes. */
(function(g){
 var core=g.__civhomebrewCore,boot=g.__civhomebrewBoot,shared=g.CivAppsNativeUI.sessions.current;
 var r={complete:false,error:null,steps:[],started:Date.now()},choose=boot.system.choose,choices=0;
 g.__installedAppsTest=r;
 boot.system.choose=function(name){if(name==='launcher')choices++;return choose.apply(boot.system,arguments);};
 function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
 function input(name){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(e);}
 async function key(name){
  for(var type of ['keydown','keyup']){var e=document.createEvent('Event');e.initEvent(type,true,true);Object.defineProperty(e,'key',{value:name});g.dispatchEvent(e);await delay(180);}
 }
 function owner(){var d=shared.renderer.owner.display;return String(d.device)+':'+String(d.swapchain);}
 var firstOwner=owner();r.owner=firstOwner;
 async function ready(mode,id,timeout){
  var end=Date.now()+(timeout||15000);
  while(Date.now()<end){
   var state=core.getState(),view=shared.active;
   if(shared.stats.errors.length)throw Error(shared.stats.errors.join('; '));
   if(state.mode===mode&&(mode==='app'||!state.busy)&&view&&view.root.id===id){view.ui.update();if(view.ui.stats.frames>0)return view.ui;}
   await delay(25);
  }
  throw Error('Timed out: '+mode+' '+id+' '+JSON.stringify(core.getState()));
 }
 setTimeout(async function(){try{
  await core.showLauncher();await ready('launcher','civhomebrew');choices=0;
  for(var i=0;i<2;i++){
   core.showTerminal();await ready('terminal','civhomebrew-core');var at=Date.now();
   await core.showLauncher();await ready('launcher','civhomebrew');
   r.steps.push({kind:'terminal',cycle:i,returnMs:Date.now()-at,sourceSelections:choices});
  }
  if(choices!==0)throw Error('Warm Terminal returns reselected Launcher source');
  for(var app of [{id:'hello-civswitch',root:'hello-civswitch',text:'Hello'},
                  {id:'moonlight-civswitch',root:'moonlight-simple-ui',text:'Hosts'},
                  {id:'doom-civhomebrew',root:'doom-civhomebrew',text:'DOOM'},
                  {id:'civswitch-kit-checks',root:'civswitch-kit-checks',text:'CivSwitch Kit Checks'},
                  {id:'sw2nes',root:'sw2nes',text:'SW2NES'}]){
   for(var cycle=0;cycle<2;cycle++){
    await delay(350);
    var tiles=Array.from(document.querySelectorAll('#payload-grid [role=option]')),target=tiles.findIndex(function(t){return t.getAttribute('data-id')===app.id;});
    if(target<0)throw Error('Missing tile: '+app.id);
    for(var moves=0;g.__civswitchApp.getState().selected!==target&&moves<30;moves++){
     var selected=g.__civswitchApp.getState().selected,row=Math.floor(selected/6),wanted=Math.floor(target/6);
     input(row!==wanted?(row>wanted?'nav-up':'nav-down'):(selected>target?'nav-left':'nav-right'));await delay(180);
    }
    if(g.__civswitchApp.selection()!==app.id)throw Error('Selection failed: '+app.id);
    var before=choices,start=Date.now();input('accept');var ui=await ready('app',app.root,60000),firstFrameMs=Date.now()-start;
    if(!ui.scene.commands.some(function(c){return c.kind==='text'&&c.text.indexOf(app.text)>=0;}))throw Error('App content absent: '+app.id);
    if(core.getState().ftp)throw Error('FTP still active in app');
    await delay(600);
    if(app.id==='sw2nes'){
     var end=Date.now()+15000;while(g.__civswitchApp.getState().mode!=='browser'&&Date.now()<end)await delay(80);
     if(g.__civswitchApp.getState().mode!=='browser')throw Error('NES browser not usable');
     await key('Escape');
     if(g.__civswitchApp.getState().browserButton!=='Exit')throw Error('NES exit selection failed');
     if(!ui.scene.commands.some(function(c){return c.kind==='text'&&c.text==='Confirm exit';}))throw Error('NES exit is not rendered');
    }else{
     input('nav-down');await delay(220);
     if(!document.querySelector('#'+app.root+' [data-selected="true"]'))throw Error('App navigation lacks selected control: '+app.id);
    }
    var back=Date.now();
    if(app.id==='sw2nes')await key('x');else input('cancel');
    await ready('launcher','civhomebrew');
    if(owner()!==firstOwner)throw Error('Native owner changed');
    if(choices!==before)throw Error('App return reselected Launcher source');
    r.steps.push({kind:'app',id:app.id,cycle:cycle,firstFrameMs:firstFrameMs,returnMs:Date.now()-back,sourceSelections:choices,ftp:core.getState().ftp});
   }
  }
  if(owner()!==firstOwner||shared.stats.errors.length)throw Error('Owner/session failure after returns');
  r.complete=true;r.errors=shared.stats.errors.slice();r.services=core.getState();
 }catch(e){r.error=String(e.stack||e).slice(0,3000);var child=g.__civswitchApp;if(child&&child.id!=='civhomebrew'&&child.close)try{await child.close();}catch(_){};}
 finally{boot.system.choose=choose;r.finished=Date.now();}},350);
})(window);
