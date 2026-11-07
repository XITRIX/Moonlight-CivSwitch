/* UI entry point. tools/send_ui.py bundles this with its runtime dependencies. */
(async function () {
    "use strict";

    if (window.__moonlightSimpleUI) window.__moonlightSimpleUI.close();

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
    var screen = "connect";
    var gameHost = null;

    function report(message) {
        // Diagnostic messages never include field contents.
        if (typeof log === "function") Promise.resolve(log(message)).catch(function () {});
        else if (window.console) console.info(message);
    }

    function element(tag, parent, styles, text) {
        var node = document.createElement(tag);
        if (styles) Object.assign(node.style, styles);
        if (text !== undefined) node.textContent = text;
        if (parent) parent.appendChild(node);
        return node;
    }

    function listen(target, name, handler, capture) {
        target.addEventListener(name, handler, !!capture);
        removers.push(function () { target.removeEventListener(name, handler, !!capture); });
    }

    var root = element("div", document.body, {
        position: "fixed", left: "0", top: "0", right: "0", bottom: "0",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        backgroundColor: "#0c1220", color: "#f4f7ff", fontFamily: "Arial, sans-serif",
        // Keep game-owned keyboard/dialog layers above our overlay.
        zIndex: "1", boxSizing: "border-box"
    });
    root.id = "moonlight-simple-ui";
    // A non-text focus target for returning from the OS keyboard.
    root.tabIndex = -1;
    root.style.outline = "none";

    var panel = element("div", root, {
        display: "flex", flexDirection: "column", width: "600px", maxWidth: "88vw",
        padding: "36px", border: "1px solid #29354b", borderRadius: "18px",
        backgroundColor: "#131d2e", boxSizing: "border-box"
    });
    element("h1", panel, {
        display: "flex", margin: "0 0 30px 0", fontSize: "46px", fontWeight: "700",
        lineHeight: "1.2", color: "#f4f7ff"
    }, "Moonlight");

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
    host.value = "192.168.1.4:47989";
    var connect = element("button", panel, {
        display: "flex", alignItems: "center", justifyContent: "center", width: "100%",
        height: "58px", marginTop: "4px", padding: "0 16px", border: "2px solid #5275b4",
        borderRadius: "9px", backgroundColor: "#284c83", color: "#ffffff",
        fontFamily: "Arial, sans-serif", fontSize: "22px", fontWeight: "700", outline: "none"
    }, "Connect");
    connect.id = "moonlight-connect";
    connect.type = "button";
    connect.tabIndex = -1;
    var settingsButton = element("button", panel, {
        display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"48px",marginTop:"12px",
        border:"2px solid #35435b",borderRadius:"9px",backgroundColor:"#0c1423",color:"#f4f7ff",
        fontFamily:"Arial, sans-serif",fontSize:"20px",outline:"none"
    },"Settings");
    settingsButton.id="moonlight-open-settings";settingsButton.type="button";settingsButton.tabIndex=-1;

    var status = element("div", panel, {
        display: "flex", minHeight: "24px", marginTop: "20px", fontSize: "16px",
        lineHeight: "1.5", color: "#b7c6dd"
    }, "Press Connect to check Sunshine and pair.");
    status.id = "moonlight-status";
    status.setAttribute("role", "status");
    var pinDisplay = element("div", panel, {
        display: "none", marginTop: "14px", fontSize: "48px", fontWeight: "700",
        color: "#f4f7ff", letterSpacing: "8px", textAlign: "center"
    });
    pinDisplay.id = "moonlight-pairing-pin";
    var hints = element("div", root, {
        display: "flex", marginTop: "24px", fontSize: "17px", color: "#a7b6cf",
        textAlign: "center", maxWidth: "94vw"
    }, "D-pad up/down: Move    A: Edit / Select    B: Back");
    var controls = [host, connect, settingsButton];
    var streamMode=window.MoonlightSettings.defaults(),settingsLoaded=false,settingsReturn="connect",settingsTransport=null;
    function loadSettings(){
        if(settingsLoaded)return;settingsLoaded=true;
        try{
            if(window.MoonlightNative&&window.MoonlightNative.available){settingsTransport=window.MoonlightNative.create();if(settingsTransport.loadStreamSettings)streamMode=window.MoonlightSettings.validate(settingsTransport.loadStreamSettings());}
        }catch(error){report("MOONLIGHT_SETTINGS_LOAD_ERROR: "+error.message);}
    }
    var settings=window.MoonlightSettingsScreen.create({parent:root,onBack:function(mode){
        if(settingsTransport&&settingsTransport.saveStreamSettings)settingsTransport.saveStreamSettings(mode);
        streamMode=mode;settings.hide();screen=settingsReturn;
        if(screen==="games")games.resume();else panel.style.display="flex";
        heldDirection="";ignoreInputUntil=Date.now()+200;root.focus();paintFocus();
        report("MOONLIGHT_SETTINGS_SAVED: "+JSON.stringify(mode));
    }});
    function openSettings(){
        if(connectionTask||streamTask||editing||closed)return;
        loadSettings();settingsReturn=screen;
        if(screen==="games")games.hide();else panel.style.display="none";
        screen="settings";heldDirection="";settings.show(streamMode);paintFocus();root.focus();
    }
    var streamTask = null;
    var stream = window.MoonlightStreamScreen ? window.MoonlightStreamScreen.create({parent:root,
        log:function(text){report("MOONLIGHT_STREAM_CORE: "+text);},
        onStats:function(stats){report("MOONLIGHT_STREAM_STATS: "+JSON.stringify(stats));},
        onBack:function(){if(!closed){screen="games";games.resume("Stream stopped. Choose an application to reconnect.");hints.style.display="flex";ignoreInputUntil=Date.now()+250;paintFocus();}}
    }) : null;
    var games = window.MoonlightGames.create({parent:root,onBack:returnToHost,onRefresh:refreshGames,onLaunch:launchGame,onSettings:openSettings,
        onArtworkLoaded:function(id,bytes,cached){report((cached?"MOONLIGHT_ARTWORK_CACHED: ":"MOONLIGHT_ARTWORK_LOADED: ")+id+" ("+bytes+" bytes)");},
        onArtworkDisplayed:function(id){report("MOONLIGHT_ARTWORK_DISPLAYED: "+id);},
        onArtworkError:function(id,error){report("MOONLIGHT_ARTWORK_ERROR: "+id+" "+error.message);}
    });
    root.appendChild(hints);

    function paintFocus() {
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
            : screen === "games"
            ? "D-pad: Move    A: Select    B: Back"
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
                value = editor.node.value;
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

    function observeNativeCompletion(module, editor) {
        var prototype = module.default && module.default.prototype;
        var name = "onVirtualKeyboardTextEntered";
        var descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, name);
        var original = descriptor && descriptor.value;
        if (typeof original !== "function") return;
        function wrapped() {
            var isOurTextbox = this.Root === editor.node;
            try { return original.apply(this, arguments); }
            finally { if (isOurTextbox) finishNativeEdit(editor, true, "native"); }
        }
        prototype[name] = wrapped;
        editor.restoreCallbacks = function () {
            if (prototype[name] === wrapped) Object.defineProperty(prototype, name, descriptor);
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
        if (!connectionTask) status.textContent = selected === 1 ? "Press A to connect and load games." : selected===2?"Press A to change stream settings.":"Press A to edit.";
        paintFocus();
    }

    async function beginEdit(index, requestKeyboard) {
        if (nativeEditor || connectionTask || screen !== "connect") return;
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
            var module = await textboxModule;
            if (closed || nativeEditor !== editor) return;
            observeNativeCompletion(module, editor);
            editor.node = document.createElement("fxs-textbox");
            Object.assign(editor.node.style, {
                position: "fixed", left: "0", top: "0", width: "1px", height: "1px",
                opacity: "0", pointerEvents: "none"
            });
            editor.node.setAttribute("enabled", "true");
            editor.node.setAttribute("value", editor.original);
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
            var input = editor.node.querySelector("input");
            if (input) {
                input.type = "text";
                input.value = editor.original;
                input.maxLength = 128;
            }
            if (typeof editor.node.receiveFocus === "function") editor.node.receiveFocus();
            else editor.node.focus();
            // Gameface applies focus/layout during its next frame.
            await new Promise(function (resolve) { requestAnimationFrame(resolve); });
            if (closed || nativeEditor !== editor) return;
            observeKeyboardCancelEvents(editor);
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
        if (connectionTask) {
            if (selected === 1) {
                connectionSignal.aborted = true;
                status.textContent = "Canceling connection…";
            }
            return;
        }
        if (selected === 0) {
            if (editing) {
                endEdit();
                status.textContent = "Press A to edit.";
            } else beginEdit(selected, true);
        } else if(selected===2){
            openSettings();
        } else {
            connectToSunshine();
        }
    }

    function launchGame(app) {
        if (connectionTask || streamTask || closed) return;
        if (!stream || !window.MoonlightStreamClient) { games.fail("Streaming runtime unavailable. Send the UI with --streaming."); return; }
        loadSettings();
        games.hide();screen="stream";hints.style.display="none";heldDirection="";
        try {
            streamTask=stream.show(gameHost.address,app,streamMode).then(function(result){
                if(!closed && result && result.error)games.fail(result.error.message);
            }).catch(function(error){if(!closed){screen="games";games.resume(error.message);hints.style.display="flex";}report("MOONLIGHT_STREAM_ERROR: "+error.message);})
                .finally(function(){streamTask=null;});
        } catch(error) {screen="games";games.resume(error.message);hints.style.display="flex";}
    }

    function connectToSunshine() {
        if (connectionTask || closed) return;
        if (!window.MoonlightNative || !window.MoonlightNative.available || !window.MoonlightPairing || !window.MoonlightApps) {
            status.textContent = "Pairing requires the Switch loader. Browser preview supports UI only.";
            return;
        }
        connectionSignal = { aborted: false };
        connect.textContent = "Cancel";
        pinDisplay.style.display = "none";
        var options;
        try {
            options = window.MoonlightNative.create();
            options.signal = connectionSignal;
            options.onProgress = function (event) {
                if (closed) return;
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
            connectionTask = pairing.checkAndPair(address).then(async function (result) {
                if (closed || signal.aborted) return;
                report("MOONLIGHT_PAIRING_SAVED: " + (result.reused ? "reused" : "new"));
                gameHost = {address:address,hostname:result.hostname,httpsPort:result.httpsPort};
                screen = "games";
                panel.style.display = "none";
                games.show(result.hostname);
                paintFocus();
                await fetchGames(options, signal);
            }).catch(function (error) {
                if (!closed) {
                    if (screen === "games") games.fail(error.message);
                    else status.textContent = error.message;
                }
                report("MOONLIGHT_CONNECTION_ERROR: " + error.message);
            }).finally(function () {
                connectionTask = null;
                connectionSignal = null;
                connect.textContent = "Connect";
                pinDisplay.style.display = "none";
            });
        } catch (error) {
            connectionSignal = null;
            connect.textContent = "Connect";
            status.textContent = error.message;
            report("MOONLIGHT_CONNECTION_ERROR: " + error.message);
        }
    }

    async function fetchGames(options, signal) {
        options.onArtworkCacheError=function(error){report("MOONLIGHT_ARTWORK_CACHE_ERROR: "+error.message);};
        games.startLoading();
        report("MOONLIGHT_APPLIST_LOADING");
        var result = await window.MoonlightApps.create(options).listApps(gameHost.address, gameHost.httpsPort);
        if (closed || signal.aborted || screen !== "games") return;
        var address=gameHost.address,port=gameHost.httpsPort;
        games.setApps(result.apps,function(app,artworkSignal){
            return window.MoonlightApps.create(Object.assign({},options,{signal:artworkSignal})).loadArtwork(address,app.id,port);
        },result.host);
        report("MOONLIGHT_APPLIST_LOADED: " + result.apps.length);
    }

    function refreshGames() {
        if (connectionTask || closed || screen !== "games") return;
        connectionSignal = {aborted:false};
        var signal = connectionSignal;
        try {
            var options = window.MoonlightNative.create();
            options.signal = signal;
            connectionTask = fetchGames(options, signal).catch(function (error) {
                if (!closed && screen === "games") games.fail(error.message);
                report("MOONLIGHT_APPLIST_ERROR: " + error.message);
            }).finally(function () {connectionTask=null;connectionSignal=null;});
        } catch (error) {
            connectionSignal=null;
            games.fail(error.message);
            report("MOONLIGHT_APPLIST_ERROR: " + error.message);
        }
    }

    function returnToHost() {
        if (connectionSignal) connectionSignal.aborted = true;
        games.hide();
        screen="connect";
        panel.style.display="flex";
        selected=1;
        heldDirection="";
        ignoreInputUntil=Date.now()+200;
        status.textContent="Press Connect to load games.";
        root.focus();
        paintFocus();
        report("MOONLIGHT_HOST_SCREEN");
    }

    function action(name, inputStatus, source, x, y) {
        if (closed) return;
        if (screen === "stream") { stream.action(name,Number(inputStatus),x,y);return; }
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
            else if (screen === "settings") settings.move(name.slice(4));
            else if (name === "nav-up" || name === "nav-down") select(selected + (name === "nav-up" ? -1 : 1));
        } else {
            if (phase !== 0) return;
            if (name === "accept") activate();
            else if (screen === "settings") settings.back();
            else if (screen === "games") returnToHost();
            else if (editing) {
                endEdit();
                status.textContent = "Choose a field to edit.";
            } else close();
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
        if (screen === "stream") { stream.key(event,true);consume(event);return; }
        if (nativeEditor) {
            if (event.key === "Escape") action("cancel", event.repeat ? 3 : 0, "keyboard");
            return;
        }
        var name = { ArrowUp: "nav-up", ArrowDown: "nav-down", Enter: "accept", Escape: "cancel" }[event.key];
        if ((screen === "games"||screen==="settings") && (event.key === "ArrowLeft" || event.key === "ArrowRight")) name=event.key==="ArrowLeft"?"nav-left":"nav-right";
        if (event.key === "Tab") {
            if (screen === "games") games.step(event.shiftKey ? -1 : 1);
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
        if (closed) return;
        closed = true;
        if (connectionSignal) connectionSignal.aborted = true;
        endEdit();
        if (frame !== null) cancelAnimationFrame(frame);
        var artworkDone=games.destroy();
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
        delete window.__moonlightSimpleUI;
        // Let in-flight native requests release sockets before the loader blocks in accept().
        Promise.all([connectionTask,artworkDone,streamDone,streamTask]).then(finish,finish);
    }

    controls.forEach(function (control, index) {
        listen(control, "click", function () {
            if (screen !== "connect") return;
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
    window.__moonlightSimpleUI = { close: close };
    paintFocus();
    frame = requestAnimationFrame(pollGamepads);
    if (typeof log === "function") await log("MOONLIGHT_UI_READY");
    // Keep eval pending: otherwise CivSwitch immediately blocks in accept().
    await lifetime;
})();
