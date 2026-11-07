/* Read pairing status and initialize only the dedicated disposable cache. */
(async function(){
 await log('MOONLIGHT_CACHE_TRANSPORT_BEGIN');
 var transport=window.MoonlightNative.create();await log('MOONLIGHT_CACHE_TRANSPORT_READY');
 var identity=transport.loadIdentity();await log('MOONLIGHT_CACHE_IDENTITY: '+!!identity);
 var host=transport.loadHost('192.168.1.4:47989');await log('MOONLIGHT_CACHE_HOST: '+!!host);
 await log('MOONLIGHT_CACHE_INDEX_READ_BEGIN');
 var value=transport.artworkCache.get('0'.repeat(64));await log('MOONLIGHT_CACHE_INDEX_READ_END: '+(value===null));
})();
