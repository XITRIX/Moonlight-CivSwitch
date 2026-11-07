/* Bounded, read-only execution checks. No console filesystem operations. */
(async function () {
    var prefix="MOONLIGHT_STREAM_WEB_";
    async function out(name,value){await log(prefix+name+": "+JSON.stringify(value));}
    function error(e){return String(e&&e.message||e);}
    function pause(ms){return new Promise(function(done){setTimeout(done,ms);});}
    async function bounded(promise,ms){return Promise.race([Promise.resolve(promise),pause(ms).then(function(){throw Error("Timed out after "+ms+"ms");})]);}
    var names=["WebAssembly","Worker","SharedWorker","SharedArrayBuffer","Atomics","Blob","URL","fetch","VideoDecoder","EncodedVideoChunk","VideoFrame","AudioDecoder","EncodedAudioChunk","AudioContext","webkitAudioContext","OfflineAudioContext","MediaSource","SourceBuffer","RTCPeerConnection","WebTransport","OffscreenCanvas","ImageData"];
    var inventory={};names.forEach(function(name){inventory[name]=typeof window[name];});
    inventory.crossOriginIsolated=window.crossOriginIsolated;
    inventory.secureContext=window.isSecureContext;
    inventory.gpu=typeof navigator.gpu;
    inventory.gamepads=typeof navigator.getGamepads;
    await out("INVENTORY",inventory);
    var wasmBytes=new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);
    try {
        var WA=window.WebAssembly;
        if(!WA)throw Error("WebAssembly is absent");
        await out("WASM_VALIDATE",WA.validate(wasmBytes));
        var module=new WA.Module(wasmBytes),instance=new WA.Instance(module);
        await out("WASM_EXECUTION",{add:instance.exports.add(19,23),negative:instance.exports.add(-17,3)});
        var asynchronous=await bounded(WA.instantiate(wasmBytes),2000);
        await out("WASM_ASYNC",asynchronous.instance.exports.add(40,2));
        var memory=new WA.Memory({initial:2,maximum:4}),view=new Uint8Array(memory.buffer);view[0]=173;view[65536]=91;
        var oldPages=memory.grow(1);await out("WASM_MEMORY",{oldPages:oldPages,bytes:memory.buffer.byteLength,first:new Uint8Array(memory.buffer)[0],second:new Uint8Array(memory.buffer)[65536]});
        // Same i32 signature, imported JS callback exported back to the caller.
        var imported=new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,2,9,1,3,101,110,118,1,102,0,0,7,7,1,3,114,117,110,0,0]);
        var callbacks=0,bridge=new WA.Instance(new WA.Module(imported),{env:{f:function(a,b){callbacks++;return a*b;}}});
        await out("WASM_IMPORT_CALLBACK",{value:bridge.exports.run(6,7),calls:callbacks});
        try{var shared=new WA.Memory({initial:1,maximum:2,shared:true});await out("WASM_SHARED_MEMORY",{shared:shared.buffer instanceof SharedArrayBuffer,bytes:shared.buffer.byteLength});}
        catch(e){await out("WASM_SHARED_MEMORY_ERROR",error(e));}
    } catch(e){await out("WASM_ERROR",error(e));}
    try {
        if(typeof SharedArrayBuffer!=="function"||typeof Atomics!=="object")throw Error("SharedArrayBuffer/Atomics unavailable");
        var sharedArray=new Int32Array(new SharedArrayBuffer(16));Atomics.store(sharedArray,0,17);
        await out("ATOMICS",{old:Atomics.add(sharedArray,0,25),value:Atomics.load(sharedArray,0),wait:Atomics.wait(sharedArray,1,1,0)});
    } catch(e){await out("ATOMICS_ERROR",error(e));}
    var worker,workerUrl;
    try {
        if(typeof Worker!=="function")throw Error("Worker is absent");
        if(typeof Blob!=="function"||typeof URL!=="function"||typeof URL.createObjectURL!=="function")throw Error("Worker blob URL prerequisites absent");
        workerUrl=URL.createObjectURL(new Blob(['onmessage=function(e){var result={value:e.data.value+1,wasm:typeof WebAssembly};if(e.data.shared){var a=new Int32Array(e.data.shared);Atomics.add(a,0,1);result.shared=Atomics.load(a,0);}postMessage(result);}'],{type:"text/javascript"}));
        worker=new Worker(workerUrl);
        var reply=new Promise(function(resolve,reject){worker.onmessage=function(e){resolve(e.data);};worker.onerror=function(e){reject(Error(e.message||"Worker error"));};});
        var message={value:41};if(typeof SharedArrayBuffer==="function"){message.shared=new SharedArrayBuffer(4);new Int32Array(message.shared)[0]=41;}
        worker.postMessage(message);await out("WORKER_ROUNDTRIP",await bounded(reply,2000));
    }catch(e){await out("WORKER_ERROR",error(e));}
    finally{if(worker)worker.terminate();if(workerUrl)URL.revokeObjectURL(workerUrl);}
    var canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;
    for(var type of ["2d","webgl","webgl2","webgpu"]){
        try{
            var surface=document.createElement("canvas");surface.width=32;surface.height=32;
            var ctx=surface.getContext(type);var result={available:!!ctx};
            if(ctx&&type==="2d"){
                ctx.fillStyle="#2080e0";ctx.fillRect(0,0,32,32);result.readback=Array.from(ctx.getImageData(0,0,1,1).data);
                var pixels=ctx.createImageData(1,1);pixels.data.set([91,123,177,255]);ctx.putImageData(pixels,0,0);result.uploadReadback=Array.from(ctx.getImageData(0,0,1,1).data);
            }
            if(ctx&&type.indexOf("webgl")===0){result.version=ctx.getParameter(ctx.VERSION);ctx.getExtension("WEBGL_lose_context")?.loseContext();}
            await out("CANVAS_"+type.toUpperCase(),result);
        }catch(e){await out("CANVAS_"+type.toUpperCase()+"_ERROR",error(e));}
    }
    for(var tag of ["video","audio"]){
        var media=document.createElement(tag),supported={};
        for(var mime of ['video/mp4; codecs="avc1.42E01E"','video/mp4; codecs="hvc1.1.6.L93.B0"','video/webm; codecs="vp8"','video/webm; codecs="vp9"','audio/ogg; codecs="opus"','audio/webm; codecs="opus"','audio/wav; codecs="1"']){
            try{supported[mime]=typeof media.canPlayType==="function"?media.canPlayType(mime):"API absent";}catch(e){supported[mime]=error(e);}
        }
        supported.play=typeof media.play;supported.requestVideoFrameCallback=typeof media.requestVideoFrameCallback;
        await out(tag.toUpperCase()+"_TYPES",supported);
    }
    if(typeof MediaSource==="function"){
        var support={};for(var mime of ['video/mp4; codecs="avc1.42E01E"','video/webm; codecs="vp8"','audio/webm; codecs="opus"']){try{support[mime]=MediaSource.isTypeSupported(mime);}catch(e){support[mime]=error(e);}}
        await out("MSE_TYPES",support);
    }
    var Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    try {
        if(typeof Offline!=="function")throw Error("OfflineAudioContext absent");
        var offline=new Offline(1,2048,48000),osc=offline.createOscillator();osc.frequency.value=440;osc.connect(offline.destination);osc.start();
        var audio=await bounded(offline.startRendering(),2000),samples=audio.getChannelData(0),peak=0;
        for(var i=0;i<samples.length;i++)peak=Math.max(peak,Math.abs(samples[i]));
        await out("AUDIO_OFFLINE_RENDER",{samples:samples.length,sampleRate:audio.sampleRate,peak:peak});
    }catch(e){await out("AUDIO_OFFLINE_ERROR",error(e));}
    var AC=window.AudioContext||window.webkitAudioContext,live;
    try{
        if(typeof AC!=="function")throw Error("AudioContext absent");
        live=new AC();await bounded(live.resume(),1500);
        var buffer=live.createBuffer(1,4800,48000),data=buffer.getChannelData(0);
        for(var j=0;j<data.length;j++)data[j]=Math.sin(j*2*Math.PI*440/48000)*0.03;
        var source=live.createBufferSource();source.buffer=buffer;source.connect(live.destination);source.start();
        await pause(200);await out("AUDIO_LIVE",{state:live.state,sampleRate:live.sampleRate,currentTime:live.currentTime});
    }catch(e){await out("AUDIO_LIVE_ERROR",error(e));}
    finally{if(live&&typeof live.close==="function")try{await bounded(live.close(),1000);}catch(_){}}
    if(typeof VideoDecoder==="function"){
        for(var codec of ["avc1.42E01E","hvc1.1.6.L93.B0","vp8"]){try{var config=await bounded(VideoDecoder.isConfigSupported({codec:codec,codedWidth:64,codedHeight:64}),1500);await out("VIDEO_DECODER_CONFIG",{codec:codec,supported:config.supported});}catch(e){await out("VIDEO_DECODER_ERROR",{codec:codec,error:error(e)});}}
    }
    if(typeof AudioDecoder==="function")try{var config=await bounded(AudioDecoder.isConfigSupported({codec:"opus",sampleRate:48000,numberOfChannels:2}),1500);await out("AUDIO_DECODER_CONFIG",{codec:"opus",supported:config.supported});}catch(e){await out("AUDIO_DECODER_ERROR",error(e));}
    await out("END",true);
})();
