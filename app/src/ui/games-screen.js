/* A small paged host library. No launch/stream request is issued by this view. */
(function (global) {
    "use strict";
    function create(options) {
        var apps = [], selected = 0, page = 0, pageSize = 6, loading = false;
        function element(tag, parent, styles, text) {
            var node = document.createElement(tag);
            Object.assign(node.style, styles || {});
            if (text !== undefined) node.textContent = text;
            parent.appendChild(node); return node;
        }
        var panel = element("div", options.parent, {
            display:"none",flexDirection:"column",width:"900px",maxWidth:"88vw",padding:"28px",
            border:"1px solid #29354b",borderRadius:"18px",backgroundColor:"#131d2e",boxSizing:"border-box"
        });
        panel.id = "moonlight-games-screen";
        element("div",panel,{fontSize:"17px",color:"#94b6e2",marginBottom:"6px"},"Moonlight");
        element("h2",panel,{fontSize:"36px",lineHeight:"1.2",margin:"0 0 6px 0",color:"#f4f7ff"},"Games");
        var hostname = element("div",panel,{fontSize:"18px",color:"#a7b6cf",marginBottom:"16px"});
        var list = element("div",panel,{display:"flex",flexDirection:"column"});
        list.id = "moonlight-game-list";
        list.setAttribute("role","listbox");list.setAttribute("aria-label","Host games and applications");
        var message = element("div",panel,{fontSize:"16px",lineHeight:"1.4",minHeight:"24px",marginTop:"8px",color:"#b7c6dd"});
        message.id = "moonlight-games-status";message.setAttribute("role","status");
        var footer = element("div",panel,{display:"flex",alignItems:"center",marginTop:"12px"});
        var count = element("div",footer,{fontSize:"16px",color:"#a7b6cf",flexGrow:"1"});
        var buttonStyle = {height:"44px",padding:"0 18px",marginLeft:"12px",fontSize:"18px",fontFamily:"Arial, sans-serif",
            color:"#fff",border:"2px solid #35435b",borderRadius:"8px",backgroundColor:"#0c1423",outline:"none"};
        var refresh = element("button",footer,buttonStyle,"Refresh"), back = element("button",footer,buttonStyle,"Back");
        refresh.id="moonlight-games-refresh";back.id="moonlight-games-back";
        [refresh,back].forEach(function (button) {button.type="button";button.tabIndex=-1;});
        var rowNodes = [];
        function highlight(node, active) {
            node.style.borderColor=active?"#94c6ff":"#35435b";
            node.style.backgroundColor=active?"#284c83":"#0c1423";
            node.setAttribute("data-selected",active?"true":"false");
        }
        function paint() {
            rowNodes.forEach(function (row) {
                highlight(row.node,row.index===selected);
                row.node.setAttribute("aria-selected",row.index===selected?"true":"false");
            });
            highlight(refresh,selected===apps.length);highlight(back,selected===apps.length+1);
            refresh.setAttribute("aria-disabled",loading?"true":"false");
            count.textContent=apps.length ? apps.length+" apps · Page "+(page+1)+" / "+Math.ceil(apps.length/pageSize) : "0 apps";
        }
        function render() {
            while(list.firstChild)list.removeChild(list.firstChild);
            rowNodes=[];
            if (apps.length) {
                apps.slice(page*pageSize,(page+1)*pageSize).forEach(function (app, offset) {
                    var index=page*pageSize+offset;
                    var row=element("button",list,{display:"flex",alignItems:"center",width:"100%",height:"54px",minHeight:"54px",
                        marginBottom:"8px",padding:"0 18px",border:"2px solid #35435b",borderRadius:"9px",boxSizing:"border-box",
                        fontFamily:"Arial, sans-serif",fontSize:"22px",textAlign:"left",color:"#f4f7ff",backgroundColor:"#0c1423",outline:"none"});
                    row.type="button";row.tabIndex=-1;row.setAttribute("role","option");row.setAttribute("data-app-id",String(app.id));
                    element("span",row,{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},app.title);
                    row.addEventListener("click",function(){selected=index;paint();activate();});
                    rowNodes.push({index:index,node:row});
                });
            } else {
                element("div",list,{display:"flex",alignItems:"center",minHeight:"120px",padding:"16px",fontSize:"22px",color:"#b7c6dd"},
                    loading?"Loading games…":"No games to show.");
            }
            paint();
        }
        function move(delta) {
            selected=(selected+delta+apps.length+2)%(apps.length+2);
            if(selected<apps.length && Math.floor(selected/pageSize)!==page){page=Math.floor(selected/pageSize);render();}
            else paint();
        }
        function activate() {
            if(selected===apps.length){if(!loading)options.onRefresh();}
            else if(selected===apps.length+1)options.onBack();
            else {message.textContent="Selected: "+apps[selected].title;}
        }
        refresh.addEventListener("click",function(){selected=apps.length;paint();activate();});
        back.addEventListener("click",options.onBack);
        return {
            show:function(name){hostname.textContent=name;apps=[];selected=0;page=0;panel.style.display="flex";},
            hide:function(){panel.style.display="none";},
            startLoading:function(){loading=true;message.textContent="Fetching games from Sunshine…";render();},
            setApps:function(value){apps=value;loading=false;selected=0;page=0;message.textContent=apps.length?"Choose a game or application.":"No games or applications are configured in Sunshine.";render();},
            fail:function(error){loading=false;message.textContent=error;render();},
            move:move,activate:activate
        };
    }
    global.MoonlightGames = {create:create};
})(typeof window !== "undefined" ? window : globalThis);
