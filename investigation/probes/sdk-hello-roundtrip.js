/* Exercise installed Hello through controller navigation and Launcher Start/A. */
(function(g){
 var core=g.__civhomebrewCore,shared=g.CivNanoVGSession&&g.CivNanoVGSession.current,main=g.__civNanoVGMainLauncher;
 if(!core||!shared||!main)throw Error('Installed native launcher required');
 var compiled=g.CivNanoVGFactory,sessions=g.CivNanoVGSession;
 function owner(){var d=shared.renderer.owner.display;return String(d.device)+':'+String(d.swapchain);}
 var firstOwner=owner(),report={version:1,launchPath:'launcher-controller-accept',complete:false,error:null,identity:main.identity,owner:firstOwner,steps:[]};
 g.__civNanoVGHelloLauncherStart=report;
 function delay(ms){return new Promise(r=>setTimeout(r,ms));}
 async function ready(mode,id){var end=Date.now()+15000;while(Date.now()<end){var s=core.getState(),a=shared.active;if(shared.stats.errors.length)throw Error(shared.stats.errors.join('; '));if(s.mode===mode&&(mode==='app'||!s.busy)&&a&&a.root.id===id){a.ui.update();if(a.ui.stats.frames>0)return a.ui;}await delay(25);}throw Error(mode+' '+id+' timed out: '+JSON.stringify(core.getState()));}
 function input(name){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(e);}
 setTimeout(async function(){try{
  await core.showLauncher();await ready('launcher','civhomebrew');
  for(var i=0;i<2;i++){
   await delay(350);
   var tiles=Array.from(document.querySelectorAll('#payload-grid [role=option]')),target=tiles.findIndex(t=>t.getAttribute('data-id')==='hello-civswitch');
   if(target<0)throw Error('Hello tile missing');
   for(var moves=0;g.__civswitchApp.getState().selected!==target&&moves<30;moves++){
    var selected=g.__civswitchApp.getState().selected,row=Math.floor(selected/6),wanted=Math.floor(target/6);
    input(row!==wanted?(row>wanted?'nav-up':'nav-down'):(selected>target?'nav-left':'nav-right'));await delay(180);
   }
   if(g.__civswitchApp.selection()!=='hello-civswitch')throw Error('Could not select Hello through launcher input');
   input('accept');
   var ui=await ready('app','hello-civswitch'),app=g.__civswitchApp;if(!app||app.renderer!=='native-shared')throw Error('Hello did not borrow native UI');
   input('accept');await delay(450);ui.update();
   if(!ui.scene.commands.some(c=>c.kind==='text'&&c.text.indexOf('Action ran 1 time.')>=0))throw Error('Action status was not rendered');
   var pixel=shared.renderer.sample([[4,4]])[0];if(pixel[0]!==12||pixel[1]!==18||pixel[2]!==32||pixel[3]!==255)throw Error('Hello background pixel mismatch: '+pixel);
   var state=core.getState();if(state.launcher||state.ftp||!state.services.rpc||!state.services.raw)throw Error('Child service ownership mismatch');
   input('nav-down');await delay(250);ui.update();if(document.querySelector('#hello-civswitch button[data-selected="true"]').textContent!=='Close app')throw Error('Navigation did not select Close');
   // First cycle covers B; second covers the selected Close action.
   input(i?'accept':'cancel');ui=await ready('launcher','civhomebrew');
   if((g.__civswitchApp&&g.__civswitchApp.id==='hello-civswitch')||document.getElementById('hello-civswitch'))throw Error('Hello cleanup was incomplete');
   if(owner()!==firstOwner||g.CivNanoVGFactory!==compiled||g.CivNanoVGSession!==sessions)throw Error('Renderer owner or modules were recreated');
   report.steps.push({cycle:i,helloPixel:pixel,renderedStatus:'Action ran 1 time.',exit:i?'Close app':'B',owner:owner(),mounts:main.mounts,services:state.services});await delay(400);
  }
  report.errors=shared.stats.errors.slice();report.complete=true;
 }catch(e){report.error=String(e.stack||e).slice(0,2000);var child=g.__civswitchApp;if(child&&child.id==='hello-civswitch')await child.close();}finally{report.finished=Date.now();}},500);
})(window);
