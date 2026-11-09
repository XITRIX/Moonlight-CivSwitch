/* Paged portrait-card library with controller navigation and stream launch. */
(function (global) {
    "use strict";
    function create(options) {
        var apps = [], selected = 0, page = 0, loading = false, visible = false;
        var columns = 4, pageSize = 4, cardWidth = 240, cardHeight = 320, gap = 16;
        var preferredColumn = 0, lastCard = 0, cardNodes = [];
        var runningAppId=0, hostName="";
        var artwork=null,artworkHost=null,artworkTasks=[],busyTimer=null;
        function stopArtwork() {
            if(!artwork)return;
            var pending=artwork.close();artwork=null;artworkTasks.push(pending);
            pending.then(function(){artworkTasks=artworkTasks.filter(function(value){return value!==pending;});});
        }
        function element(tag, parent, styles, text) {
            var node = document.createElement(tag);
            Object.assign(node.style, styles || {});
            if (text !== undefined) node.textContent = text;
            parent.appendChild(node);
            return node;
        }
        var panel = element("div", options.parent, {
            display:"none",flexDirection:"column",width:"1100px",maxWidth:"88vw",padding:"28px",
            border:"1px solid #29354b",borderRadius:"18px",backgroundColor:"#131d2e",boxSizing:"border-box"
        });
        panel.id = "moonlight-games-screen";
        element("div",panel,{fontSize:"17px",color:"#94b6e2",marginBottom:"6px"},"Moonlight");
        var header=element("div",panel,{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"});
        element("h2",header,{fontSize:"36px",lineHeight:"1.2",margin:"0",color:"#f4f7ff"},"Games");
        var hostname = element("div",panel,{fontSize:"18px",color:"#a7b6cf",marginBottom:"16px"});
        // Explicit flex rows work in Gameface without relying on CSS Grid.
        var library = element("div",panel,{position:"relative"});
        var grid = element("div",library,{display:"flex",flexDirection:"column"});
        grid.id = "moonlight-game-list";
        grid.setAttribute("role","grid");
        grid.setAttribute("aria-label","Host games and applications");
        var busy = element("div",library,{display:"none",position:"absolute",left:"0",right:"0",top:"0",bottom:"0",alignItems:"center",justifyContent:"center",zIndex:"2"});
        busy.id="moonlight-games-progress";
        var busyBox=element("div",busy,{display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 32px",border:"1px solid #35435b",borderRadius:"10px",backgroundColor:"#131d2e"});
        var dots=element("div",busyBox,{display:"flex",marginBottom:"14px"});
        var indicators=[0,1,2].map(function(){return element("span",dots,{display:"block",width:"10px",height:"10px",margin:"0 4px",borderRadius:"5px",backgroundColor:"#35435b"});});
        var busyText=element("div",busyBox,{fontSize:"22px",lineHeight:"28px",color:"#f4f7ff"});
        element("div",busyBox,{fontSize:"16px",lineHeight:"24px",marginTop:"6px",color:"#b7c6dd"},"B to go back");
        function updateBusy(){
            if(busyTimer!==null){clearInterval(busyTimer);busyTimer=null;}
            var active=loading&&visible;
            busy.style.display=active?"flex":"none";
            grid.style.opacity=loading?"0.3":"1";
            grid.setAttribute("aria-busy",loading?"true":"false");
            if(active){
                var frame=0;
                function tick(){indicators.forEach(function(dot,index){dot.style.backgroundColor=index===frame%3?"#00efcf":"#35435b";});frame++;}
                tick();busyTimer=setInterval(tick,300);
            }
        }
        var message = element("div",panel,{
            fontSize:"16px",lineHeight:"1.4",minHeight:"24px",marginTop:"12px",color:"#b7c6dd",
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"
        });
        message.id = "moonlight-games-status";
        message.setAttribute("role","status");
        var footer = element("div",panel,{display:"flex",alignItems:"center",marginTop:"12px"});
        var count = element("div",footer,{fontSize:"16px",color:"#a7b6cf",flexGrow:"1"});
        var buttonStyle = {height:"44px",padding:"0 18px",marginLeft:"12px",fontSize:"18px",fontFamily:"Arial, sans-serif",
            color:"#fff",border:"2px solid #35435b",borderRadius:"8px",backgroundColor:"#0c1423",outline:"none"};
        var terminate=element("button",header,Object.assign({},buttonStyle,{display:"none",alignItems:"center",justifyContent:"center",textAlign:"center",lineHeight:"22px",boxSizing:"border-box",width:"180px",flexShrink:"0"}));
        element("span",terminate,{display:"block",lineHeight:"22px"},"Terminate app");
        terminate.id="moonlight-games-terminate";terminate.type="button";terminate.tabIndex=-1;
        var refresh = element("button",footer,buttonStyle,"Refresh");
        var settings = element("button",footer,buttonStyle,"Settings");
        var back = element("button",footer,buttonStyle,"Back");
        refresh.id="moonlight-games-refresh";
        back.id="moonlight-games-back";
        settings.id="moonlight-games-settings";
        var footerButtons=[refresh,settings,back];
        footerButtons.forEach(function (button) {button.type="button";button.tabIndex=-1;});

        function layout() {
            var width = Math.min(1100, Math.floor((global.innerWidth || 1280) * 0.88));
            panel.style.width = width + "px";
            columns = width >= 960 ? 4 : width >= 700 ? 3 : 2;
            cardWidth = Math.floor((width - 56 - gap * (columns - 1)) / columns);
            cardHeight = Math.floor(cardWidth * 4 / 3);
            var rows = Math.max(1, Math.min(2, Math.floor(((global.innerHeight || 720) - 300 + gap) / (cardHeight + gap))));
            pageSize = rows * columns;
            grid.style.minHeight = cardHeight + "px";
            grid.setAttribute("aria-colcount",String(columns));
            grid.setAttribute("aria-rowcount",String(Math.ceil(apps.length / columns)));
            if (selected < apps.length) {
                page = Math.floor(selected / pageSize);
                preferredColumn = selected % columns;
            } else page = Math.min(page, Math.max(0, Math.ceil(apps.length / pageSize) - 1));
        }
        function highlight(node, active) {
            node.style.borderColor=active?"#94c6ff":"#35435b";
            node.style.backgroundColor=active?"#284c83":"#0c1423";
            node.setAttribute("data-selected",active?"true":"false");
        }
        function paint() {
            cardNodes.forEach(function (card) {
                var active = !loading&&card.index === selected;
                highlight(card.node,active);
                card.art.style.backgroundColor=active?"#233e60":"#1b2c45";
                card.node.setAttribute("aria-selected",active?"true":"false");
            });
            footerButtons.forEach(function(button,index){highlight(button,selected===apps.length+index);});
            refresh.setAttribute("aria-disabled",loading?"true":"false");
            refresh.disabled=loading;settings.disabled=loading;
            refresh.textContent=loading?"Refreshing…":"Refresh";
            terminate.style.display=runningAppId?"flex":"none";
            terminate.disabled=loading;terminate.setAttribute("aria-disabled",loading?"true":"false");
            highlight(terminate,selected===apps.length+3);
            hostname.textContent=hostName+(runningAppId?" · Running "+runningTitle():"");
            count.textContent=apps.length ? apps.length+" apps · Page "+(page+1)+" / "+Math.ceil(apps.length/pageSize) : "0 apps";
        }
        function initials(title) {
            return title.trim().split(/\s+/).slice(0,2).map(function (word) {return Array.from(word)[0] || "";}).join("").toUpperCase();
        }
        function displayArtwork(card,value) {
            if(card.image)return;
            var owner=artwork;
            var scale=Math.max((cardWidth-4)/value.width,(cardHeight-58)/value.height);
            var image=value.image;
            if(!image) {
                image=element("img",card.art,{
                    display:"block",position:"absolute",left:"50%",top:"50%",transform:"translate(-50%, -50%)",maxWidth:"none"
                });
                value.image=image;image.alt="";
                image.addEventListener("load",function(){
                    value.loaded=true;
                    var target=image.moonlightCard;
                    if(!visible||owner!==artwork||cardNodes.indexOf(target)<0)return;
                    target.placeholder.style.visibility="hidden";
                    if(options.onArtworkDisplayed)options.onArtworkDisplayed(target.id);
                });
                image.addEventListener("error",function(){
                    if(owner!==artwork)return;
                    var target=image.moonlightCard;
                    if(image.parentNode)image.parentNode.removeChild(image);
                    if(target){target.image=null;target.placeholder.style.visibility="visible";}
                    owner.reject(image.moonlightAppId,new Error("The UI could not decode the PNG cover."));
                });
            } else card.art.appendChild(image);
            card.image=image;image.moonlightCard=card;image.moonlightAppId=card.id;
            image.style.width=Math.ceil(value.width*scale)+"px";image.style.height=Math.ceil(value.height*scale)+"px";
            if(value.loaded)card.placeholder.style.visibility="hidden";
            else if(!image.getAttribute("src"))image.src=value.url;
        }
        function detachCards() {
            cardNodes.forEach(function(card){
                if(card.image){card.image.moonlightCard=null;card.art.removeChild(card.image);}
            });
            while(grid.firstChild)grid.removeChild(grid.firstChild);
            cardNodes=[];
        }
        function render() {
            detachCards();
            grid.setAttribute("aria-rowcount",String(Math.ceil(apps.length / columns)));
            if (apps.length) {
                var end = Math.min(apps.length, (page + 1) * pageSize);
                for (var start = page * pageSize; start < end; start += columns) {
                    var row = element("div",grid,{
                        display:"flex",flexDirection:"row",marginBottom:start+columns<end?gap+"px":"0"
                    });
                    row.setAttribute("role","row");
                    apps.slice(start,Math.min(start+columns,end)).forEach(function (app, offset) {
                        var index = start + offset;
                        var card = element("button",row,{
                            display:"flex",flexDirection:"column",alignItems:"stretch",width:cardWidth+"px",height:cardHeight+"px",
                            flexShrink:"0",marginRight:offset<columns-1?gap+"px":"0",padding:"0",overflow:"hidden",
                            border:"2px solid #35435b",borderRadius:"10px",boxSizing:"border-box",outline:"none",
                            fontFamily:"Arial, sans-serif",color:"#f4f7ff",backgroundColor:"#0c1423",textAlign:"left"
                        });
                        card.disabled=loading||!!runningAppId&&app.id!==runningAppId;
                        card.style.opacity=runningAppId&&app.id!==runningAppId?"0.35":"1";
                        card.setAttribute("aria-disabled",card.disabled?"true":"false");
                        if(app.id===runningAppId){
                            card.setAttribute("data-running","true");
                            card.setAttribute("aria-description","Running — select to resume");
                        }
                        card.type="button";
                        card.tabIndex=-1;
                        card.setAttribute("role","gridcell");
                        card.setAttribute("data-app-id",String(app.id));
                        card.setAttribute("aria-label",app.title);
                        card.setAttribute("aria-rowindex",String(Math.floor(index/columns)+1));
                        card.setAttribute("aria-colindex",String(index%columns+1));
                        var art = element("div",card,{
                            display:"flex",alignItems:"center",justifyContent:"center",flexGrow:"1",minHeight:"0",
                            width:"100%",position:"relative",overflow:"hidden",
                            fontSize:"54px",fontWeight:"700",color:"#94b6e2",backgroundColor:"#1b2c45"
                        });
                        if(app.id===runningAppId){
                            var badge=element("span",art,{display:"flex",alignItems:"center",position:"absolute",right:"8px",top:"8px",zIndex:"1",padding:"5px 10px",borderRadius:"6px",backgroundColor:"#00efcf",color:"#1b1e21",fontSize:"16px",fontWeight:"700",lineHeight:"20px"});
                            // Draw the play indicator instead of relying on a glyph the game font may lack.
                            element("span",badge,{display:"block",width:"0",height:"0",borderTop:"6px solid transparent",borderBottom:"6px solid transparent",borderLeft:"9px solid #1b1e21",marginRight:"7px",flexShrink:"0"});
                            element("span",badge,{display:"block",lineHeight:"20px"},"Running");
                        }
                        var placeholder=element("span",art,{},initials(app.title));
                        art.setAttribute("aria-hidden","true");
                        element("span",card,{
                            display:"block",width:"100%",height:"54px",minHeight:"54px",padding:"0 14px",boxSizing:"border-box",
                            lineHeight:"50px",fontSize:"18px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"
                        },app.title);
                        card.addEventListener("click",function(){choose(index,true);activate();});
                        var entry={id:app.id,index:index,node:card,art:art,placeholder:placeholder,image:null};
                        cardNodes.push(entry);
                        var cover=artwork&&artwork.get(app.id);
                        if(cover)displayArtwork(entry,cover);
                    });
                }
            } else {
                element("div",grid,{
                    display:"flex",alignItems:"center",justifyContent:"center",minHeight:cardHeight+"px",
                    padding:"16px",boxSizing:"border-box",fontSize:"22px",color:"#b7c6dd"
                },loading?"Loading games…":"No games to show.");
            }
            paint();
            if(artwork&&!loading)artwork.setVisible(apps.slice(page*pageSize,(page+1)*pageSize));
        }
        function choose(index, rememberColumn) {
            selected=index;
            if (selected < apps.length) {
                lastCard=selected;
                if (rememberColumn) preferredColumn=selected%columns;
                var nextPage=Math.floor(selected/pageSize);
                if (nextPage!==page) {page=nextPage;render();return;}
            }
            paint();
        }
        function runningTitle(){var app=apps.filter(function(app){return app.id===runningAppId;})[0];return app?app.title:"application #"+runningAppId;}
        function available(){
            var values=[];apps.forEach(function(app,i){if(!runningAppId||app.id===runningAppId)values.push(i);});
            return values.concat([apps.length,apps.length+1,apps.length+2],runningAppId?[apps.length+3]:[]);
        }
        function move(direction) {
            if(runningAppId){
                var card=apps.length&&apps[0].id===runningAppId,top=apps.length+3;
                if(selected===top){if(direction==="left"&&card)choose(0,false);else if(direction==="down")choose(card?0:apps.length,false);}
                else if(selected<apps.length){if(direction==="right"||direction==="up")choose(top,false);else if(direction==="down")choose(apps.length,false);}
                else if(direction==="up")choose(card?0:top,false);
                else if(direction==="left")choose(Math.max(apps.length,selected-1),false);
                else if(direction==="right")choose(Math.min(apps.length+2,selected+1),false);
                return;
            }
            if (selected >= apps.length) {
                if (direction==="left") choose(Math.max(apps.length,selected-1),false);
                else if (direction==="right") choose(Math.min(apps.length+footerButtons.length-1,selected+1),false);
                else if (direction==="up" && apps.length) choose(lastCard,false);
                return;
            }
            var column=selected%columns, row=Math.floor(selected/columns);
            if (direction==="left" && column>0) choose(selected-1,true);
            else if (direction==="right" && column<columns-1 && selected+1<apps.length) choose(selected+1,true);
            else if (direction==="up" && row>0) choose((row-1)*columns+preferredColumn,false);
            else if (direction==="down") {
                var nextRow=(row+1)*columns;
                if (nextRow<apps.length) choose(Math.min(nextRow+preferredColumn,apps.length-1),false);
                else choose(apps.length+(preferredColumn>=columns/2?2:0),false);
            }
        }
        function step(delta) {
            var values=available(),index=values.indexOf(selected);
            choose(values[(index+delta+values.length)%values.length],true);
        }
        function activate() {
            if(selected===apps.length+2){options.onBack();return;}
            if(selected===apps.length+3){if(runningAppId&&!loading&&options.onTerminate)options.onTerminate({id:runningAppId,title:runningTitle()});return;}
            if(loading)return;
            if(selected<apps.length&&runningAppId&&apps[selected].id!==runningAppId)return;
            if(selected===apps.length){if(!loading)options.onRefresh();}
            else if(selected===apps.length+1){if(options.onSettings)options.onSettings();}
            else if(selected===apps.length+2)options.onBack();
            else if(options.onLaunch)options.onLaunch(apps[selected]);
            else message.textContent="Selected: "+apps[selected].title;
        }
        function resized() {if(visible){layout();render();}}
        global.addEventListener("resize",resized);
        terminate.addEventListener("click",function(){choose(apps.length+3,false);activate();});
        refresh.addEventListener("click",function(){choose(apps.length,false);activate();});
        settings.addEventListener("click",function(){choose(apps.length+1,false);activate();});
        back.addEventListener("click",options.onBack);
        return {
            show:function(name){hostName=name;hostname.textContent=name;runningAppId=0;terminate.style.display="none";apps=[];selected=0;page=0;preferredColumn=0;lastCard=0;visible=true;layout();panel.style.display="flex";},
            hide:function(){visible=false;updateBusy();if(artwork)artwork.pause();panel.style.display="none";detachCards();},
            resume:function(text){visible=true;layout();panel.style.display="flex";if(text)message.textContent=text;render();},
            startLoading:function(text){if(artwork)artwork.pause();loading=true;busyText.textContent=text||"Refreshing games…";message.textContent=text||"Fetching games and running status from Sunshine…";updateBusy();render();},
            setApps:function(value,loadArtwork,hostKey,currentAppId){
                if(artworkHost!==hostKey){stopArtwork();artworkHost=hostKey;}
                runningAppId=currentAppId||0;
                apps=value.filter(function(app){return app.id===runningAppId;}).concat(value.filter(function(app){return app.id!==runningAppId;}));loading=false;selected=runningAppId&&(!apps.length||apps[0].id!==runningAppId)?apps.length+3:0;page=0;preferredColumn=0;lastCard=0;
                if(artwork)artwork.setLoader(loadArtwork);
                else if(loadArtwork)artwork=global.MoonlightArtwork.create({
                    load:loadArtwork,
                    onReady:function(id,cover){
                        if(options.onArtworkLoaded)options.onArtworkLoaded(id,cover.bytes,!!cover.cacheHit);
                        cardNodes.forEach(function(card){if(apps[card.index].id===id)displayArtwork(card,cover);});
                    },
                    onError:function(id,error){if(options.onArtworkError)options.onArtworkError(id,error);}
                });
                updateBusy();layout();message.textContent=runningAppId?"Resume the running application, or terminate it to choose another.":apps.length?"Choose a game or application.":"No games or applications are configured in Sunshine.";render();
            },
            fail:function(error){loading=false;updateBusy();message.textContent=error;render();},
            destroy:function(){visible=false;updateBusy();stopArtwork();global.removeEventListener("resize",resized);return Promise.all(artworkTasks);},
            move:move,step:step,activate:activate
        };
    }
    global.MoonlightGames = {create:create};
})(typeof window !== "undefined" ? window : globalThis);
