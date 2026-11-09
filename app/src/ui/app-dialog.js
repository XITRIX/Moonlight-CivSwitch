/* Installation-modal palette, with two equal-width controller actions. */
(function(global){
    "use strict";
    function create(options){
        function node(tag,parent,style,text){var n=document.createElement(tag);Object.assign(n.style,style);if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;}
        var layer=node("div",options.parent,{position:"absolute",left:"0",right:"0",top:"0",bottom:"0",display:"none",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,0.72)",zIndex:"6"});
        layer.id=options.id;layer.setAttribute("role","dialog");layer.setAttribute("aria-modal","true");layer.setAttribute("aria-labelledby",options.id+"-title");layer.setAttribute("aria-describedby",options.id+"-description");
        var panel=node("div",layer,{width:"680px",maxWidth:"88vw",boxSizing:"border-box",boxShadow:"inset 0 0 0 1px #3b4146",borderRadius:"8px",backgroundColor:"#1b1e21",color:"#f5f5f5",textAlign:"center",overflow:"hidden"});
        var title=node("div",panel,{padding:"32px 32px 0",fontSize:"26px",lineHeight:"34px",overflowWrap:"break-word"});title.id=options.id+"-title";
        var description=node("div",panel,{padding:"26px 32px 32px",fontSize:"20px",lineHeight:"1.5",color:"#c5cdd0",whiteSpace:"pre-wrap"});description.id=options.id+"-description";
        var row=node("div",panel,{display:"flex",boxShadow:"inset 0 1px 0 #3b4146"}),buttons=[],actions=[],selected=0,opened=false,last={name:"",time:0},nextRepeat=0,ignoreUntil=0;
        for(var i=0;i<2;i++){
            var button=node("button",row,{display:"flex",alignItems:"center",justifyContent:"center",width:"50%",minHeight:"72px",padding:"12px",boxSizing:"border-box",border:"2px solid transparent",borderRadius:"0",backgroundColor:"transparent",color:"#00efcf",fontFamily:"Arial, sans-serif",fontSize:"24px",outline:"none"});
            button.type="button";button.tabIndex=-1;button.id=options.id+"-"+i;
            (function(index){button.addEventListener("click",function(){if(opened){selected=index;paint();activate();}});})(i);
            buttons.push(button);
        }
        // Full-size focus borders cover the panel ring and row separator.
        // Only each button's outer bottom corner follows the popup's radius.
        buttons[0].style.borderBottomLeftRadius="8px";
        buttons[1].style.borderBottomRightRadius="8px";
        var hint=node("div",layer,{position:"absolute",bottom:"28px",right:"40px",fontSize:"22px",color:"#f5f5f5"},"B Back     A OK");
        function paint(){buttons.forEach(function(button,index){var active=selected===index;button.style.backgroundColor=active?"#303a3d":"transparent";button.style.borderColor=active?"#00efcf":"transparent";button.setAttribute("data-selected",active?"true":"false");});}
        function hide(){opened=false;layer.style.display="none";last={name:"",time:0};}
        function activate(){var fn=actions[selected];hide();if(fn)fn();}
        function cancel(){hide();if(options.onCancel)options.onCancel();}
        function action(name,phase,x,y){
            if(!opened)return false;
            if(name==="keyboard-escape")name="cancel";
            if(name==="nav-move"){
                if(Math.abs(Number(x))>.5)name=Number(x)>0?"nav-right":"nav-left";
                else if(Math.abs(Number(y))>.5)name=Number(y)>0?"nav-up":"nav-down";
                else return true;
            }
            if(phase!==0&&phase!==3)return true;
            var now=Date.now();if(now<ignoreUntil||last.name===name&&now-last.time<90)return true;
            if(name.indexOf("nav-")===0){
                if(phase===3&&now<nextRepeat)return true;
                nextRepeat=now+(phase===0?350:150);
                if(name==="nav-left"||name==="nav-up")selected=0;
                else if(name==="nav-right"||name==="nav-down")selected=1;
                paint();
            }else if(phase===0){if(name==="cancel")cancel();else if(name==="accept")activate();}
            last={name:name,time:now};return true;
        }
        return {show:function(config){title.textContent=config.title;description.textContent=config.description;actions=config.actions;buttons.forEach(function(b,i){b.textContent=config.labels[i];});selected=0;opened=true;ignoreUntil=Date.now()+150;last={name:"",time:0};nextRepeat=0;paint();layer.style.display="flex";},hide:hide,isOpen:function(){return opened;},action:action,
            key:function(event,down){if(!opened)return false;if(down){if(event.key==="Tab")action(event.shiftKey?"nav-left":"nav-right",0);else{var name={ArrowLeft:"nav-left",ArrowRight:"nav-right",ArrowUp:"nav-up",ArrowDown:"nav-down",Enter:"accept",Escape:"cancel"}[event.key];if(name)action(name,event.repeat?3:0);}}return true;},
            destroy:function(){hide();if(layer.parentNode)layer.parentNode.removeChild(layer);}};
    }
    global.MoonlightAppDialog={create:create};
})(window);
