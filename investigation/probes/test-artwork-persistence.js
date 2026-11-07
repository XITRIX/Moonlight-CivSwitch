/* Fetch visible covers once, then verify reuse from a new native transport/store.
   All writes are confined by the app adapter to save:/moonlight-experiment/artwork/. */
(async function(){
 await log('MOONLIGHT_ARTWORK_PERSIST_BEGIN');
 var transport=window.MoonlightNative.create(),requests=0,errors=[],original=transport.requestHttps;
 transport.requestHttps=async function(request){await log('MOONLIGHT_ARTWORK_REQUEST: '+request.path.split('?')[0]);if(request.path.indexOf('/appasset?')===0)requests++;return original(request);};
 transport.onArtworkCacheError=function(error){errors.push(error.message);log('MOONLIGHT_ARTWORK_CACHE_ERROR: '+error.message);};
 var cache=transport.artworkCache;
 transport.artworkCache={get:function(key){log('MOONLIGHT_ARTWORK_DISK_READ');return cache.get(key);},put:function(key,bytes){log('MOONLIGHT_ARTWORK_DISK_WRITE: '+bytes.length);return cache.put(key,bytes);},remove:function(key){return cache.remove(key);}};
 var api=window.MoonlightApps.create(transport);
 await log('MOONLIGHT_ARTWORK_LIST_BEGIN');
 var list=await api.listApps('192.168.1.4:47989'),hits=0,bytes=0;
 await log('MOONLIGHT_ARTWORK_LIST_END: '+list.apps.length);
 for(var app of list.apps.slice(0,4)){
  var begin=Date.now(),cover=await api.loadArtwork('192.168.1.4:47989',app.id);
  if(cover.cacheHit)hits++;bytes+=cover.bytes;
  await log('MOONLIGHT_ARTWORK_PERSIST_ITEM: '+JSON.stringify({id:app.id,cacheHit:!!cover.cacheHit,bytes:cover.bytes,milliseconds:Date.now()-begin}));
 }
 await log('MOONLIGHT_ARTWORK_PERSIST_RESULT: '+JSON.stringify({covers:Math.min(list.apps.length,4),cacheHits:hits,assetRequests:requests,bytes:bytes,errors:errors}));
 if(errors.length)throw Error('Persistent artwork cache failed');
 if(window.__moonlightExpectArtworkCacheHits&&requests)throw Error('Expected all artwork to come from disk');
 delete window.__moonlightExpectArtworkCacheHits;
})();
