/* Visible-page artwork queue and bounded, memory-only LRU cache. */
(function (global) {
    "use strict";
    function create(options) {
        var cache=new Map(),failed=new Set(),queue=[],task=null,bytes=0;
        var signal={aborted:false},limit=8*1024*1024;
        function get(id) {
            var value=cache.get(id);
            if(value){cache.delete(id);cache.set(id,value);}
            return value;
        }
        async function drain() {
            var requestSignal=signal;
            while(queue.length && !requestSignal.aborted) {
                var app=queue.shift();
                if(cache.has(app.id)||failed.has(app.id))continue;
                try {
                    var value=await options.load(app,requestSignal);
                    if(requestSignal.aborted)return;
                    // Count UTF-16 URL storage, rather than only the compressed PNG.
                    var size=value.url.length*2;
                    if(size>limit)throw new Error("Artwork exceeds the memory cache limit.");
                    while(bytes+size>limit && cache.size) {
                        var oldest=cache.keys().next().value;
                        bytes-=cache.get(oldest).url.length*2;cache.delete(oldest);
                    }
                    cache.set(app.id,value);bytes+=size;
                    options.onReady(app.id,value);
                } catch(error) {
                    if(requestSignal.aborted)return;
                    failed.add(app.id);options.onError(app.id,error);
                }
            }
        }
        function pump() {
            if(task||signal.aborted||!queue.length)return;
            task=drain().finally(function(){task=null;pump();});
        }
        return {
            get:get,
            setLoader:function(load){options.load=load;failed.clear();},
            reject:function(id,error) {
                if(cache.has(id)){var value=cache.get(id);if(value.invalidateCache)value.invalidateCache();bytes-=value.url.length*2;cache.delete(id);}
                failed.add(id);options.onError(id,error);
            },
            setVisible:function(apps) {
                if(signal.aborted)signal={aborted:false};
                // Discard queued off-page work; an in-flight download may finish.
                queue=apps.filter(function(app){return !cache.has(app.id)&&!failed.has(app.id);});
                pump();
            },
            pause:function(){signal.aborted=true;queue=[];},
            close:function() {
                signal.aborted=true;queue=[];cache.clear();bytes=0;failed.clear();
                return task || Promise.resolve();
            }
        };
    }
    global.MoonlightArtwork={create:create};
})(typeof window!=="undefined"?window:globalThis);
