/* UI entry point. tools/send_ui.py bundles this with its runtime dependencies. */
(async function () {
    "use strict";

    if (window.__moonlightSimpleUI) await window.__moonlightSimpleUI.close();

    var finish;
    var lifetime = new Promise(function (resolve) { finish = resolve; });
    var selected = 0;
    var editing = false;
    var closed = false;
    var subscription = null;
    var nativeSubscribed = false;
    var owner = { owner: "moonlight-simple-ui" };
    var removers = [];
    var frame = null;
    var lastAction = { name: "", source: "", time: 0 };
    var heldDirection = "";
    var nextRepeat = 0;
    var gamepadButtons = {};
    var nativeEditor = null;
    var textboxModule = null;
    var ignoreInputUntil = 0;
    var connectionTask = null;
    var connectionSignal = null;
    var screen = "hosts";
    var gameHost = null;
    var nativeView = null;

    function report(message) {
        if(nativeView)nativeView.invalidate();
        if(streamDiagnostics&&(streamDiagnostics.localOnly||screen==="stream")){recordStreamMessage(message);return;}
        // Diagnostic messages never include field contents.
        if (typeof log === "function") {
            // CivSwitch's native log buffer is 2048 bytes; telemetry can be larger.
            if(message.length>1000){for(var i=0;i<message.length;i+=256)Promise.resolve(log("MOONLIGHT_LOG_PART: "+JSON.stringify({text:message.slice(i,i+256),last:i+256>=message.length}))).catch(function(){});}
            else Promise.resolve(log(message)).catch(function () {});
        }
        else if (window.console) console.info(message);
    }

    var element = window.MoonlightLayout.element;

    function listen(target, name, handler, capture) {
        target.addEventListener(name, handler, !!capture);
        removers.push(function () { target.removeEventListener(name, handler, !!capture); });
    }

    var root = element("div", document.body, {
        position: "fixed", left: "0", top: "0", right: "0", bottom: "0",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        backgroundColor: "#0c1220", color: "#f4f7ff", fontFamily: "Arial, sans-serif",
        // Keep game-owned keyboard/dialog layers above our overlay.
        zIndex: "1", boxSizing: "border-box", padding:"24px", fontSize:"16px"
    });
    root.id = "moonlight-simple-ui";root.setAttribute("data-civ-native-ui","1");
    // Revision keys avoid copying cached cover data URLs into a markup key on
    // every library navigation. The stream view retains its own narrower key.
    if(typeof window.MutationObserver==="function"){
        var sceneRevision=0,sceneObserver=new window.MutationObserver(function(){sceneRevision++;});
        root.__civNanoVGSceneKey=function(){return "moonlight-ui:"+window.innerWidth+"x"+window.innerHeight+":"+sceneRevision;};
        sceneObserver.observe(root,{subtree:true,attributes:true,childList:true,characterData:true});
        removers.push(function(){sceneObserver.disconnect();delete root.__civNanoVGSceneKey;});
    }
    // A non-text focus target for returning from the OS keyboard.
    root.tabIndex = -1;
    root.style.outline = "none";
    function resizeLayout(){
        // Explicit bounds also support native overlay children on the console.
        root.style.width=window.innerWidth+"px";root.style.height=window.innerHeight+"px";
        window.MoonlightLayout.resize(root);
        if(nativeView)nativeView.invalidate();
    }
    listen(window,"resize",resizeLayout);
    resizeLayout();

    // Check the resident renderer before creating screens or starting app work.
    try{nativeView=await window.MoonlightNativeUi.mount(root,{log:report});}
    catch(error){removers.forEach(function(remove){remove();});if(root.parentNode)root.parentNode.removeChild(root);throw error;}
    if(nativeView&&nativeView.blocked){
        var blockerView=nativeView;
        var blockerHandle={lifetime:blockerView.lifetime,close:function(){
            removers.forEach(function(remove){remove();});
            if(root.parentNode)root.parentNode.removeChild(root);
            if(window.__civswitchApp===blockerHandle)delete window.__civswitchApp;
            if(window.__moonlightSimpleUI===blockerHandle)delete window.__moonlightSimpleUI;
            return blockerView.close();
        }};
        window.__civswitchApp=blockerHandle;window.__moonlightSimpleUI=blockerHandle;
        await blockerView.lifetime;await blockerHandle.close();return;
    }

    var panel = element("div", root, {
        display: "none", flexDirection: "column", width: "600px", maxWidth: "88vw",
        maxHeight:"800px", overflowY:"auto",
        padding: "32px", border: "1px solid #29354b", borderRadius: "18px",
        backgroundColor: "#131d2e", boxSizing: "border-box"
    });
    panel.id = "moonlight-pair-screen";
    element("div", panel, {fontSize:"17px",color:"#94b6e2",marginBottom:"6px"}, "Moonlight");
    element("h2", panel, {
        display: "flex", margin: "0 0 20px 0", fontSize: "36px", fontWeight: "700",
        lineHeight: "1.2", color: "#f4f7ff"
    }, "Pair");

    function field(id, labelText, type, placeholder) {
        var label = element("label", panel, {
            display: "flex", flexDirection: "column", marginBottom: "22px",
            fontSize: "20px", color: "#c7d2e7"
        });
        label.htmlFor = id;
        element("span", label, { display: "flex", marginBottom: "9px" }, labelText);
        var input = element("input", label, {
            display: "flex", width: "100%", height: "58px", padding: "0 16px",
            backgroundColor: "#0c1423", color: "#f4f7ff", border: "2px solid #35435b",
            borderRadius: "9px", fontFamily: "Arial, sans-serif", fontSize: "22px",
            boxSizing: "border-box", outline: "none", alignItems: "flex-start",
            justifyContent: "center", textAlign: "left", lineHeight: "54px"
        });
        input.id = id;
        input.type = type;
        input.placeholder = placeholder;
        input.maxLength = 128;
        input.readOnly = true;
        input.tabIndex = -1;
        input.setAttribute("autocomplete", "off");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("spellcheck", "false");
        input.setAttribute("aria-label", labelText);
        return input;
    }

    var host = field("moonlight-host", "Host:", "text", "192.168.1.4:47989");
    var pair = element("button", panel, {
        display: "flex", alignItems: "center", justifyContent: "center", width: "100%",
        height: "58px", marginTop: "4px", padding: "0 16px", border: "2px solid #5275b4",
        borderRadius: "9px", backgroundColor: "#284c83", color: "#ffffff",
        fontFamily: "Arial, sans-serif", fontSize: "22px", fontWeight: "700", outline: "none"
    }, "Pair");
    pair.id = "moonlight-pair";
    pair.type = "button";
    pair.tabIndex = -1;
    var pairBack = element("button", panel, {
        display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"48px",marginTop:"12px",
        border:"2px solid #35435b",borderRadius:"9px",backgroundColor:"#0c1423",color:"#f4f7ff",
        fontFamily:"Arial, sans-serif",fontSize:"20px",outline:"none"
    },"Back");
    pairBack.id="moonlight-pair-back";pairBack.type="button";pairBack.tabIndex=-1;

    var status = element("div", panel, {
        display: "flex", minHeight: "24px", marginTop: "20px", fontSize: "16px",
        lineHeight: "1.5", color: "#b7c6dd"
    }, "Press Pair to check Sunshine and pair.");
    status.id = "moonlight-status";
    status.setAttribute("role", "status");
    var pinDisplay = element("div", panel, {
        display: "none", marginTop: "14px", fontSize: "48px", fontWeight: "700",
        color: "#f4f7ff", letterSpacing: "8px", textAlign: "center"
    });
    pinDisplay.id = "moonlight-pairing-pin";
    var hints = element("div", root, {
        display: "flex", marginTop: "24px", fontSize: "17px", color: "#a7b6cf",
        textAlign: "center", width:"94%", maxWidth: "94vw", justifyContent:"center",
        flexShrink:"0", minHeight:"26px", lineHeight:"26px"
    }, "D-pad up/down: Move    A: Edit / Select    B: Back");
    hints.id="moonlight-ui-hints";
    var controls = [host, pair, pairBack];
    var hosts = window.MoonlightHosts.create({parent:root,onHost:openHost,onPair:openPair,onSettings:openSettings,onDelete:confirmDeleteHost});
    var streamMode=window.MoonlightSettings.defaults(),settingsLoaded=false,settingsReturn="hosts",settingsTransport=null;
    function loadSettings(){
        if(settingsLoaded)return;settingsLoaded=true;
        try{
            if(window.MoonlightNative&&window.MoonlightNative.available){settingsTransport=window.MoonlightNative.create();if(settingsTransport.loadStreamSettings)streamMode=window.MoonlightSettings.validate(settingsTransport.loadStreamSettings());}
        }catch(error){report("MOONLIGHT_SETTINGS_LOAD_ERROR: "+error.message);}
    }
    var settings=window.MoonlightSettingsScreen.create({parent:root,onBack:function(mode){
        if(settingsTransport&&settingsTransport.saveStreamSettings)settingsTransport.saveStreamSettings(mode);
        streamMode=mode;settings.hide();screen=settingsReturn;
        if(screen==="games")games.resume();else if(screen==="hosts")hosts.resume();else panel.style.display="flex";
        heldDirection="";ignoreInputUntil=Date.now()+200;root.focus();paintFocus();
        report("MOONLIGHT_SETTINGS_SAVED: "+JSON.stringify(mode));
    }});
    function openSettings(){
        if(connectionTask||streamTask||editing||closed)return;
        loadSettings();settingsReturn=screen;
        if(screen==="games")games.hide();else if(screen==="hosts")hosts.hide();else panel.style.display="none";
        screen="settings";heldDirection="";settings.show(streamMode);paintFocus();root.focus();
    }
    var streamTask = null;
    // Native log() sends over the loader's TCP socket and can block on bad Wi-Fi.
    // Keep stream diagnostics bounded in RAM; the overlay remains live.
    var streamHistory=window.MoonlightTelemetry.createHistory();
    var streamDiagnostics={messages:[],stats:null,samples:streamHistory.samples,localOnly:false};window.__moonlightStreamDiagnostics=streamDiagnostics;
    function recordStreamMessage(text){streamDiagnostics.messages.push({time:Date.now(),text:String(text).slice(0,512)});if(streamDiagnostics.messages.length>64)streamDiagnostics.messages.shift();}
    var stream = window.MoonlightStreamScreen ? window.MoonlightStreamScreen.create({parent:root,
        log:recordStreamMessage,
        onTerminate:terminateStreamApp,
        onMouseSettings:function(value){
            var mode=window.MoonlightSettings.validate(Object.assign({},streamMode,{mouse:value}));
            if(settingsTransport&&settingsTransport.saveStreamSettings)settingsTransport.saveStreamSettings(mode);
            streamMode=mode;
        },
        onTouchMode:function(touchMode){
            var mode=window.MoonlightSettings.validate(Object.assign({},streamMode,{touchMode:touchMode}));
            if(settingsTransport&&settingsTransport.saveStreamSettings)settingsTransport.saveStreamSettings(mode);
            streamMode=mode;
        },
        onPerformanceOverlay:function(enabled){
            var mode=window.MoonlightSettings.validate(Object.assign({},streamMode,{showStats:enabled}));
            if(settingsTransport&&settingsTransport.saveStreamSettings)settingsTransport.saveStreamSettings(mode);
            streamMode=mode;
        },
        onStats:function(stats){streamDiagnostics.stats=stats;streamHistory.record(stats);},
        onBack:function(){if(!closed){root.style.backgroundColor="#0c1220";screen="games";games.resume("Stream stopped. Checking the running application…");hints.style.display="flex";ignoreInputUntil=Date.now()+250;paintFocus();}}
    }) : null;
    var games = window.MoonlightGames.create({parent:root,onBack:returnToHosts,onRefresh:refreshGames,onLaunch:launchGame,onSettings:openSettings,onTerminate:confirmTerminateApp,
        onArtworkLoaded:function(id,bytes,cached){report((cached?"MOONLIGHT_ARTWORK_CACHED: ":"MOONLIGHT_ARTWORK_LOADED: ")+id+" ("+bytes+" bytes)");},
        onArtworkDisplayed:function(id){report("MOONLIGHT_ARTWORK_DISPLAYED: "+id);},
        onArtworkError:function(id,error){report("MOONLIGHT_ARTWORK_ERROR: "+id+" "+error.message);}
    });
    var appDialog=window.MoonlightAppDialog.create({parent:root,id:"moonlight-terminate-app",onCancel:function(){ignoreInputUntil=Date.now()+250;heldDirection="";}});
    root.appendChild(hints);

    function paintFocus() {
        if(nativeView)nativeView.invalidate();
        controls.forEach(function (control, index) {
            var active = index === selected;
            control.style.borderColor = active ? "#94c6ff" : (index === 1 ? "#5275b4" : "#35435b");
            control.style.backgroundColor = index === 1
                ? (active ? "#3868ac" : "#284c83")
                : (active ? "#1b2c45" : "#0c1423");
            control.setAttribute("data-selected", active ? "true" : "false");
        });
        hints.textContent = screen === "settings"
            ? "D-pad up/down: Move    Left/right: Change    A: Select    B: Back"
            : screen === "games" || screen === "hosts"
            ? (screen === "hosts" ? "D-pad: Move    A: Select    B: Return to Launcher" : "D-pad: Move    A: Select    B: Back")
            : editing
            ? "Type to edit    Enter / B: Done    D-pad up/down: Move"
            : "D-pad up/down: Move    A: Edit / Select    B: Back";
    }

    function endEdit() {
        if (nativeEditor) {
            var editor = nativeEditor;
            nativeEditor = null;
            if (editor.finishTimer !== undefined) clearTimeout(editor.finishTimer);
            // In cartridge 1.0.0 onDetach() does not clear IME callbacks.
            // Clear them before restoring the method used for registration.
            try {
                if (editor.component && typeof editor.component.clearVirtualKeyboardCallbacks === "function") {
                    editor.component.clearVirtualKeyboardCallbacks();
                }
            } catch (_) {}
            if (editor.cancelSubscriptions) editor.cancelSubscriptions.forEach(function (remove) { remove(); });
            if (editor.restoreCallbacks) editor.restoreCallbacks();
            if (editor.keyboardOverlay) {
                editor.keyboardOverlay.close();
                editor.keyboardOverlay = null;
            }
            if (editor.node) {
                try {
                    if (typeof editor.node.loseFocus === "function") editor.node.loseFocus();
                    var focused = document.activeElement;
                    if (focused && (focused === editor.node || editor.node.contains(focused))) focused.blur();
                } catch (_) {}
                if (editor.node.parentNode) editor.node.parentNode.removeChild(editor.node);
            }
        }
        editing = false;
        host.readOnly = true;
        if (document.activeElement === host) {
            document.activeElement.blur();
        }
        paintFocus();
    }

    function finishNativeEdit(editor, confirmed, source) {
        if (closed || nativeEditor !== editor) return;
        // The native callback is authoritative if a DOM completion event was
        // also dispatched during that callback.
        if (source === "native" || editor.completionSource !== "native") {
            editor.confirmed = confirmed;
            editor.completionSource = source;
        }
        if (editor.finishTimer !== undefined) return;
        // Never detach a textbox from inside its own callback. Its remaining
        // code still has to clear callbacks and release the keyboard context.
        editor.finishTimer = setTimeout(function () {
            if (closed || nativeEditor !== editor) return;
            var value;
            try {
                value = editor.value;
                if (typeof value !== "string") value = editor.node.value;
                if (typeof value !== "string" && editor.node.maybeComponent) value = editor.node.maybeComponent.value;
            } catch (_) {}
            if (editor.confirmed && typeof value === "string") editor.target.value = value;
            else if (!editor.confirmed) editor.target.value = editor.original;
            ignoreInputUntil = Date.now() + 250;
            heldDirection = "";
            nextRepeat = 0;
            lastAction = { name: "", source: "", time: 0 };
            endEdit();
            status.textContent = editor.confirmed ? "Press A to edit." : "Edit canceled.";
            root.focus();
            // Refresh after the applet's input context has had a frame to
            // settle. Do not steal focus if another editor was opened.
            requestAnimationFrame(function () {
                if (closed || nativeEditor || editing) return;
                root.focus();
                try {
                    if (window.UI && typeof window.UI.refreshInput === "function") window.UI.refreshInput();
                } catch (_) {}
            });
            report("MOONLIGHT_KEYBOARD_" + (editor.confirmed ? "CONFIRMED" : "CANCELED") + ": " + editor.completionSource);
            report("MOONLIGHT_UI_INPUT_RESUMED");
        }, 0);
    }

    function observeNativeCompletion(editor) {
        var component = editor.component;
        var name = "onVirtualKeyboardTextEntered";
        var descriptor = Object.getOwnPropertyDescriptor(component, name);
        var original = component[name];
        if (typeof original !== "function") return;
        function wrapped(data) {
            // Element-mode completion can read stale DOM text instead of the
            // IME result. Give both paths the exact replacement, as CivHomebrew does.
            editor.value = data && typeof data.data === "string" ? data.data : editor.input.value;
            editor.input.value = editor.value;
            try { return original.apply(this, arguments); }
            finally { finishNativeEdit(editor, true, "native"); }
        }
        component[name] = wrapped;
        editor.restoreCallbacks = function () {
            if (component[name] !== wrapped) return;
            if (descriptor) Object.defineProperty(component, name, descriptor);
            else delete component[name];
        };
        report("MOONLIGHT_KEYBOARD_HOOKS: " + name);
    }

    function observeKeyboardCancelEvents(editor) {
        editor.cancelSubscriptions = [];
        if (!window.engine || typeof window.engine.on !== "function") return;
        // Verified by inspecting this console's shipped FxsTextbox.onActivate:
        // engine.on("IMECanceled", this.clearVirtualKeyboardCallbacks, this).
        // Cancellation does not call a dedicated textbox completion method.
        ["IMECanceled"].forEach(function (name) {
            var context = { owner: "moonlight-keyboard-cancel" };
            function canceled() { finishNativeEdit(editor, false, "engine:" + name); }
            try {
                var handle = window.engine.on(name, canceled, context);
                editor.cancelSubscriptions.push(function () {
                    try {
                        if (handle && typeof handle.clear === "function") handle.clear();
                        else if (typeof window.engine.off === "function") window.engine.off(name, canceled, context);
                    } catch (_) {}
                });
            } catch (_) {}
        });
    }

    function select(index) {
        endEdit();
        selected = (index + controls.length) % controls.length;
        if (!connectionTask) status.textContent = selected === 1 ? "Press A to pair with this host." : selected===2?"Press A to return to Hosts.":"Press A to edit.";
        paintFocus();
    }

    async function beginEdit(index, requestKeyboard) {
        if (nativeEditor || connectionTask || screen !== "pair") return;
        select(index);
        editing = true;
        controls[index].readOnly = false;
        controls[index].focus();
        status.textContent = "Editing Host.";
        paintFocus();
        if (!requestKeyboard || !nativeSubscribed) return;

        // A plain HTML input does not establish Civ VII's virtual-keyboard
        // callbacks. Use the shipped textbox component as an offscreen editor;
        // it owns activation and the text-entered/text-canceled native events.
        var target = controls[index];
        var editor = {
            node: null,
            original: target.value,
            target: target
        };
        nativeEditor = editor;
        status.textContent = "Opening keyboard...";
        try {
            if (!textboxModule) textboxModule = import("/core/ui/components/fxs-textbox.js");
            await textboxModule;
            if (closed || nativeEditor !== editor) return;
            editor.node = document.createElement("fxs-textbox");
            Object.assign(editor.node.style, {
                position: "fixed", left: "0", top: "0", width: "1px", height: "1px",
                opacity: "0", pointerEvents: "none"
            });
            editor.node.setAttribute("value", "");
            editor.node.setAttribute("max-length", "128");
            editor.node.setAttribute("type", "text");
            editor.node.addEventListener("text-changed", function (event) {
                if (nativeEditor !== editor) return;
                var value = event.detail && event.detail.newStr;
                if (typeof value === "string") target.value = value;
            });
            editor.node.addEventListener("text-edit-stop", function (event) {
                finishNativeEdit(editor, !!(event.detail && event.detail.confirmed), "text-edit-stop");
            });
            root.appendChild(editor.node);
            // Component construction can wait for the game's stylesheets.
            var component = await new Promise(function (resolve, reject) {
                var attempts = 0;
                function ready() {
                    if (closed || nativeEditor !== editor) { reject(new Error("Editor closed")); return; }
                    var instance;
                    try { instance = editor.node.maybeComponent || editor.node.component; } catch (_) {}
                    if (instance) { resolve(instance); return; }
                    if (++attempts >= 180) { reject(new Error("fxs-textbox did not initialize")); return; }
                    setTimeout(ready, 16);
                }
                ready();
            });
            if (typeof component.onActivate !== "function") throw new Error("fxs-textbox activation unavailable");
            editor.component = component;
            var input = component.textInput || editor.node.querySelector("input");
            if (!input) throw new Error("fxs-textbox input unavailable");
            editor.input = input;
            // The enabled attribute makes the shipped component's input
            // read-only. Keep its real focused input editable and start blank.
            component.overrideText = true;
            component.isPlaceholderActive = false;
            if (component.onAttributeChanged) component.onAttributeChanged("value", null, "");
            input.type = "text";
            input.value = "";
            input.maxLength = 128;
            input.readOnly = false;
            observeNativeCompletion(editor);
            if (typeof editor.node.receiveFocus === "function") editor.node.receiveFocus();
            else editor.node.focus();
            // the layout engine applies focus/layout during its next frame.
            await new Promise(function (resolve) { requestAnimationFrame(resolve); });
            if (closed || nativeEditor !== editor) return;
            input.focus();
            input.value = "";
            observeKeyboardCancelEvents(editor);
            if (window.MoonlightNativeUi && window.MoonlightNativeUi.keyboard) {
                editor.keyboardOverlay = window.MoonlightNativeUi.keyboard(root, nativeView, function (error) {
                    if (closed || nativeEditor !== editor) return;
                    report("MOONLIGHT_KEYBOARD_OVERLAY_ERROR: " + error.message);
                    status.textContent = "Keyboard display failed. Press B to cancel.";
                });
            }
            editor.activatedAt = Date.now();
            component.onActivate();
            if (nativeEditor === editor) status.textContent = "Editing Host.";
            report("MOONLIGHT_KEYBOARD_ACTIVATED: fxs-textbox");
        } catch (error) {
            if (nativeEditor !== editor) return;
            endEdit();
            // Allow physical-keyboard input even when the native component
            // cannot be loaded in this game/runtime version.
            editing = true;
            target.readOnly = false;
            target.focus();
            paintFocus();
            status.textContent = "Keyboard unavailable. USB keyboard can still edit.";
            report("MOONLIGHT_KEYBOARD_ERROR: " + error.message);
        }
    }

    function activate() {
        if (screen === "stream") return;
        if (screen === "settings") { settings.activate(); return; }
        if (screen === "games") { games.activate(); return; }
        if (screen === "hosts") { hosts.activate(); return; }
        if (selected === 2) { returnToHosts(); return; }
        if (connectionTask) {
            if (selected === 1) {
                connectionSignal.aborted = true;
                status.textContent = "Canceling pairing…";
            }
            return;
        }
        if (selected === 0) {
            if (editing) {
                endEdit();
                status.textContent = "Press A to edit.";
            } else beginEdit(selected, true);
        } else {
            pairWithSunshine();
        }
    }

    function terminateStreamApp(address,app,signal){
        var options=window.MoonlightNative.create();options.signal=signal;
        return window.MoonlightApps.create(options).terminateApp(address,gameHost.httpsPort,app.id);
    }

    function confirmTerminateApp(app){
        if(connectionTask||closed)return;
        appDialog.show({title:"Terminate "+app.title+"?",description:"All unsaved progress could be lost.",labels:["Cancel","Terminate"],actions:[function(){ignoreInputUntil=Date.now()+250;},function(){terminateGame(app);} ]});
        heldDirection="";
    }

    function confirmDeleteHost(value){
        if(connectionTask||closed||screen!=="hosts")return;
        appDialog.show({title:"Delete "+value.hostname+"?",description:"Remove the saved pairing for "+value.address+". You can pair this host again later.",labels:["Cancel","Delete"],actions:[function(){ignoreInputUntil=Date.now()+250;},function(){
            try{
                window.MoonlightNative.create().removeHost(value.address);
                showHosts(null,"Deleted "+value.hostname+".");
            }catch(error){
                showHosts(value.address,"Could not delete host: "+error.message);
                report("MOONLIGHT_HOST_DELETE_ERROR: "+error.message);
            }
            ignoreInputUntil=Date.now()+250;
        }]});
        heldDirection="";
    }

    function terminateGame(app){
        if(connectionTask||closed)return;
        connectionSignal={aborted:false};var signal=connectionSignal;
        games.startLoading("Terminating "+app.title+"…");ignoreInputUntil=Date.now()+250;
        connectionTask=Promise.resolve().then(function(){return terminateStreamApp(gameHost.address,app,signal);}).then(function(){
            if(!closed&&!signal.aborted&&screen==="games")return fetchGames(window.MoonlightNative.create(),signal);
        }).catch(function(error){if(!closed&&screen==="games")games.fail(error.message);report("MOONLIGHT_TERMINATE_ERROR: "+error.message);})
            .finally(function(){connectionTask=null;connectionSignal=null;});
    }

    function launchGame(app) {
        if (connectionTask || streamTask || closed) return;
        if (!stream || !window.MoonlightStreamClient) { games.fail("Streaming runtime unavailable. Resend the app without --no-streaming."); return; }
        loadSettings();
        streamHistory.reset();streamDiagnostics.messages.length=0;streamDiagnostics.stats=null;
        streamDiagnostics.localOnly=true;
        games.hide();screen="stream";root.style.backgroundColor="transparent";hints.style.display="none";heldDirection="";
        var exitError=null;
        try {
            streamTask=stream.show(gameHost.address,app,streamMode,gameHost.hostname).then(function(result){
                if(result&&result.stats)streamDiagnostics.stats=result.stats;
                if(!closed && result && result.error){exitError=result.error.message;games.fail(exitError);}
            }).catch(function(error){exitError=error.message;if(!closed){root.style.backgroundColor="#0c1220";screen="games";games.resume(error.message);hints.style.display="flex";}report("MOONLIGHT_STREAM_ERROR: "+error.message);})
                .finally(function(){streamTask=null;if(!closed&&screen==="games")refreshGames(exitError);});
        } catch(error) {root.style.backgroundColor="#0c1220";screen="games";games.resume(error.message);hints.style.display="flex";}
    }

    function pairWithSunshine() {
        if (connectionTask || closed) return;
        if (!window.MoonlightNative || !window.MoonlightNative.available || !window.MoonlightPairing || !window.MoonlightApps) {
            status.textContent = "Pairing requires the Switch loader. Browser preview supports UI only.";
            return;
        }
        connectionSignal = { aborted: false };
        pair.textContent = "Cancel";
        pinDisplay.style.display = "none";
        var options;
        try {
            options = window.MoonlightNative.create();
            options.signal = connectionSignal;
            options.onProgress = function (event) {
                if (closed || screen !== "pair" || options.signal.aborted) return;
                status.textContent = event.message;
                pinDisplay.textContent = event.pin || "";
                pinDisplay.style.display = event.pin ? "flex" : "none";
                report("MOONLIGHT_SUNSHINE_" + event.stage.toUpperCase());
                if (event.stage === "generating_identity" || event.stage === "key_generated") {
                    var diagnostics = {};
                    ["elapsedMs", "steps", "primesFound", "keygenPhase", "candidatePhase", "entropyCalls", "entropyBytes", "entropyMs"].forEach(function (name) {
                        if (typeof event[name] === "number") diagnostics[name] = event[name];
                    });
                    report("MOONLIGHT_KEYGEN_PROGRESS: " + JSON.stringify(diagnostics));
                }
                if (event.pin) report("MOONLIGHT_PAIRING_PIN: " + event.pin);
            };
            var pairing = window.MoonlightPairing.create(options);
            var address = host.value, signal = connectionSignal;
            connectionTask = pairing.checkAndPair(address).then(function (result) {
                if (closed || signal.aborted) return;
                report("MOONLIGHT_PAIRING_SAVED: " + (result.reused ? "reused" : "new"));
                showHosts(result.host || window.MoonlightPairing.parseHost(address).key, "Paired with " + result.hostname + ". Choose the host to open its games.");
            }).catch(function (error) {
                if (!closed && screen === "pair") status.textContent = error.message;
                report("MOONLIGHT_CONNECTION_ERROR: " + error.message);
            }).finally(function () {
                connectionTask = null;
                connectionSignal = null;
                pair.textContent = "Pair";
                pinDisplay.style.display = "none";
            });
        } catch (error) {
            connectionSignal = null;
            pair.textContent = "Pair";
            status.textContent = error.message;
            report("MOONLIGHT_CONNECTION_ERROR: " + error.message);
        }
    }

    async function fetchGames(options, signal) {
        options.signal=signal;
        options.onArtworkCacheError=function(error){report("MOONLIGHT_ARTWORK_CACHE_ERROR: "+error.message);};
        games.startLoading();
        report("MOONLIGHT_APPLIST_LOADING");
        var result = await window.MoonlightApps.create(options).listApps(gameHost.address, gameHost.httpsPort);
        if (closed || signal.aborted || screen !== "games") return;
        var address=gameHost.address,port=gameHost.httpsPort;
        games.setApps(result.apps,function(app,artworkSignal){
            return window.MoonlightApps.create(Object.assign({},options,{signal:artworkSignal})).loadArtwork(address,app.id,port);
        },result.host,result.runningAppId);
        report("MOONLIGHT_APPLIST_LOADED: " + result.apps.length);
    }

    function refreshGames(message) {
        if (connectionTask || closed || screen !== "games") return;
        connectionSignal = {aborted:false};
        var signal = connectionSignal;
        try {
            var options = window.MoonlightNative.create();
            options.signal = signal;
            connectionTask = fetchGames(options, signal).then(function(){
                if(message&&!closed&&!signal.aborted&&screen==="games")games.fail(message);
            }).catch(function (error) {
                if (!closed && screen === "games") games.fail(error.message);
                report("MOONLIGHT_APPLIST_ERROR: " + error.message);
            }).finally(function () {connectionTask=null;connectionSignal=null;});
        } catch (error) {
            connectionSignal=null;
            games.fail(error.message);
            report("MOONLIGHT_APPLIST_ERROR: " + error.message);
        }
    }

    function openPair() {
        if (connectionTask || closed) return;
        hosts.hide();
        screen="pair";
        panel.style.display="flex";
        selected=0;
        pinDisplay.style.display="none";
        status.textContent="Press Pair to check Sunshine and pair.";
        heldDirection="";
        root.focus();
        paintFocus();
        report("MOONLIGHT_PAIR_SCREEN");
    }

    function showHosts(address, message) {
        var saved = [];
        try {
            if (window.MoonlightNative && window.MoonlightNative.available) saved = window.MoonlightNative.create().listHosts();
        } catch (error) {
            message = "Could not load paired hosts: " + error.message;
            report("MOONLIGHT_HOSTS_LOAD_ERROR: " + error.message);
        }
        screen="hosts";
        panel.style.display="none";
        pinDisplay.style.display="none";
        hosts.show(saved, address, message);
        heldDirection="";
        root.focus();
        paintFocus();
        report("MOONLIGHT_HOSTS_SCREEN");
    }

    function returnToHosts() {
        if (connectionSignal) connectionSignal.aborted = true;
        endEdit();
        games.hide();
        showHosts(gameHost && gameHost.address);
        ignoreInputUntil=Date.now()+200;
    }

    function openHost(value) {
        if (connectionTask || closed) return;
        gameHost = {address:value.address,hostname:value.hostname,httpsPort:value.httpsPort};
        hosts.hide();
        screen="games";
        games.show(value.hostname);
        heldDirection="";
        paintFocus();
        refreshGames();
    }

    function action(name, inputStatus, source, x, y) {
        if (closed) return;
        if (screen === "stream") { stream.action(name,Number(inputStatus),x,y);return; }
        if(nativeView)nativeView.invalidate();
        if(appDialog.isOpen()){appDialog.action(name,Number(inputStatus),x,y);return;}
        if (name === "keyboard-escape") name = "cancel";
        var phase = Number(inputStatus);
        if (nativeEditor) {
            // An OS keyboard normally owns controller input. Some cartridge
            // versions resume InputAction without notifying textbox cancel.
            // A fresh B/cancel delivered back to this page must be able to
            // release our editing lock; never let it also close the form.
            if (name === "cancel" && phase === 0 && nativeEditor.activatedAt !== undefined && Date.now() - nativeEditor.activatedAt >= 250) {
                finishNativeEdit(nativeEditor, false, "controller-cancel");
            }
            return;
        }
        if (Date.now() < ignoreInputUntil) return;
        if (name === "nav-move") {
            if (Math.abs(Number(x)) > Math.abs(Number(y)) && Math.abs(Number(x)) > 0.5) name = Number(x)>0?"nav-right":"nav-left";
            else if (Number(y) > 0.5) name = "nav-up";
            else if (Number(y) < -0.5) name = "nav-down";
            else if (phase !== 0 && phase !== 3 && heldDirection) name = heldDirection;
            else return;
        }
        if (["nav-up", "nav-down", "nav-left", "nav-right", "accept", "cancel"].indexOf(name) < 0) return;
        if (phase !== 0 && phase !== 3) {
            if (name === heldDirection) heldDirection = "";
            return;
        }
        var now = Date.now();
        // One press can arrive through both native and DOM input routes.
        if (lastAction.name === name && now - lastAction.time < 90) return;
        if (name.indexOf("nav-") === 0) {
            if (phase === 3 && (heldDirection !== name || now < nextRepeat)) return;
            heldDirection = name;
            nextRepeat = now + (phase === 0 ? 350 : 150);
            if (screen === "games") games.move(name.slice(4));
            else if (screen === "hosts") hosts.move(name.slice(4));
            else if (screen === "settings") settings.move(name.slice(4));
            else if (name === "nav-up" || name === "nav-down") select(selected + (name === "nav-up" ? -1 : 1));
        } else {
            if (phase !== 0) return;
            if (name === "accept") activate();
            else if (screen === "settings") settings.back();
            else if (screen === "games") returnToHosts();
            else if (editing) {
                endEdit();
                status.textContent = "Choose a field to edit.";
            } else if (screen === "pair") returnToHosts();
            else close();
        }
        lastAction = { name: name, source: source, time: now };
    }

    function consume(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function onGameEvent(event) {
        // The native textbox must receive its own navigation and completion.
        var detail = event.detail || {};
        if (screen === "stream") {
            action(detail.name, detail.status, event.type, detail.x, detail.y);
            consume(event);
            return;
        }
        if (nativeEditor) {
            action(detail.name, detail.status, event.type, detail.x, detail.y);
            return;
        }
        if (["nav-up", "nav-down", "nav-left", "nav-right", "nav-move", "accept", "cancel", "keyboard-escape"].indexOf(detail.name) < 0) return;
        action(detail.name, detail.status, event.type, detail.x, detail.y);
        consume(event);
    }

    function onKey(event) {
        if (event.key === "F8") {
            close();
            consume(event);
            return;
        }
        if(appDialog.key(event,true)){consume(event);return;}
        if (screen === "stream") { stream.key(event,true);consume(event);return; }
        if (nativeEditor) {
            if (event.key === "Escape") action("cancel", event.repeat ? 3 : 0, "keyboard");
            return;
        }
        var name = { ArrowUp: "nav-up", ArrowDown: "nav-down", Enter: "accept", Escape: "cancel" }[event.key];
        if ((screen === "games"||screen==="hosts"||screen==="settings") && (event.key === "ArrowLeft" || event.key === "ArrowRight")) name=event.key==="ArrowLeft"?"nav-left":"nav-right";
        if (event.key === "Tab") {
            if (screen === "games") games.step(event.shiftKey ? -1 : 1);
            else if(screen==="hosts")hosts.step(event.shiftKey?-1:1);
            else if(screen==="settings")settings.step(event.shiftKey?-1:1);
            else select(selected + (event.shiftKey ? -1 : 1));
            consume(event);
        } else if (name) {
            action(name, event.repeat ? 3 : 0, "keyboard");
            consume(event);
        } else if (editing) {
            // Let the input receive text/caret keys without reaching game shortcuts.
            event.stopPropagation();
        }
    }

    function pollGamepads() {
        if (closed) return;
        if (screen === "stream") {stream.poll();frame=requestAnimationFrame(pollGamepads);return;}
        // Prefer the game's native action route. Polling is a browser fallback.
        if (!nativeSubscribed && navigator.getGamepads) {
            var pads;
            try { pads = navigator.getGamepads(); } catch (_) { pads = []; }
            var mapping = [[12, "nav-up"], [13, "nav-down"], [14, "nav-left"], [15, "nav-right"], [0, "accept"], [1, "cancel"]];
            for (var p = 0; p < pads.length; p++) {
                if (!pads[p]) continue;
                for (var b = 0; b < mapping.length; b++) {
                    var index = mapping[b][0];
                    var key = p + ":" + index;
                    var down = !!(pads[p].buttons[index] && pads[p].buttons[index].pressed);
                    if (down) action(mapping[b][1], gamepadButtons[key] ? 3 : 0, "gamepad");
                    else if (gamepadButtons[key]) action(mapping[b][1], 1, "gamepad");
                    gamepadButtons[key] = down;
                }
            }
        }
        frame = requestAnimationFrame(pollGamepads);
    }

    function onNativeAction(name, inputStatus, x, y) {
        action(name, inputStatus, "InputAction", x, y);
    }

    function close() {
        if (closed) return lifetime;
        closed = true;
        if (connectionSignal) connectionSignal.aborted = true;
        endEdit();
        if (frame !== null) cancelAnimationFrame(frame);
        appDialog.destroy();
        var artworkDone=games.destroy();
        hosts.destroy();
        settings.destroy();
        var streamDone=stream?stream.destroy():null;
        removers.forEach(function (remove) { remove(); });
        try {
            if (subscription && typeof subscription.clear === "function") subscription.clear();
            else if (nativeSubscribed && window.engine && typeof window.engine.off === "function") {
                window.engine.off("InputAction", onNativeAction, owner);
            }
        } catch (_) {}
        if (root.parentNode) root.parentNode.removeChild(root);
        // Let in-flight native requests release sockets before the loader blocks in accept().
        Promise.allSettled([connectionTask,artworkDone,streamDone,streamTask,nativeView&&nativeView.close()]).then(function(){
            if(window.__moonlightSimpleUI===handle)delete window.__moonlightSimpleUI;
            if(window.__civswitchApp===handle)delete window.__civswitchApp;
            finish();
        });
        return lifetime;
    }

    controls.forEach(function (control, index) {
        listen(control, "click", function () {
            if (screen !== "pair") return;
            if (index === 0 && !connectionTask) beginEdit(index, true);
            else if (index > 0) { select(index); activate(); }
        });
    });
    listen(window, "keydown", onKey, true);
    listen(window, "blur", function () { if (stream) stream.suspend(true); });
    listen(window, "focus", function () { if (stream) stream.suspend(document.hidden); });
    listen(document, "visibilitychange", function () { if (stream) stream.suspend(document.hidden); });
    listen(window, "keyup", function (event) {
        if(screen==="stream"){stream.key(event,false);consume(event);return;}
        var name={ArrowUp:"nav-up",ArrowDown:"nav-down",ArrowLeft:"nav-left",ArrowRight:"nav-right"}[event.key];
        if (name) action(name, 1, "keyboard");
    }, true);
    listen(window, "navigate-input", onGameEvent, true);
    listen(window, "engine-input", onGameEvent, true);
    if (window.engine && typeof window.engine.on === "function") {
        try {
            subscription = window.engine.on("InputAction", onNativeAction, owner);
            nativeSubscribed = true;
        } catch (_) {}
    }
    var handle={close:close,lifetime:lifetime};
    window.__moonlightSimpleUI = handle;
    window.__civswitchApp = handle;
    showHosts();
    if(nativeView)nativeView.invalidate();
    frame = requestAnimationFrame(pollGamepads);
    if (typeof log === "function") await log("MOONLIGHT_UI_READY");
    // Keep eval pending: otherwise CivSwitch immediately blocks in accept().
    await lifetime;
})();
