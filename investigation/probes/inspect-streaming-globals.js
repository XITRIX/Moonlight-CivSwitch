/* Distinguish the DOM window from the JavaScript global object. */
(async function(){
 var values={windowEqualsGlobal:typeof globalThis!=="undefined"&&window===globalThis,
  windowArray:typeof window.Array,globalArray:typeof Array,windowWasm:typeof window.WebAssembly,globalWasm:typeof WebAssembly,
  globalWorker:typeof Worker,globalAudioContext:typeof AudioContext,globalVideoDecoder:typeof VideoDecoder,
  functionWasm:Function("return typeof WebAssembly")(),globalThisWasm:typeof globalThis!=="undefined"?typeof globalThis.WebAssembly:"no globalThis"};
 await log("MOONLIGHT_STREAM_GLOBALS: "+JSON.stringify(values));
 var descriptor=Object.getOwnPropertyDescriptor(window,"WebAssembly");await log("MOONLIGHT_STREAM_WASM_DESCRIPTOR: "+JSON.stringify(descriptor||null));
})();
