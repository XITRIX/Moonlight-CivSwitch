mergeInto(LibraryManager.library, {
  ml_io: function(op,a,b,c,d,e,f) {
    var p=Module['moonlightPlatform'];
    if(!p||typeof p.io!=='function')return -38;
    return p.io(op,[a,b,c,d,e,f],HEAPU8)|0;
  },
  ml_log__deps: ['$UTF8ToString'],
  ml_log: function(pointer) { var p=Module['moonlightPlatform'];if(p&&p.log)p.log(UTF8ToString(pointer)); },
  ml_event: function(event,a,b) { var p=Module['moonlightPlatform'];if(p&&p.event)p.event(event,a,b); },
  ml_video_setup: function(format,width,height,fps) { var p=Module['moonlightPlatform'];return p&&p.videoSetup?p.videoSetup(format,width,height,fps):-1; },
  ml_video_frame: function(bytes,length,kind,pts,sps,spsLength,pps,ppsLength) { var p=Module['moonlightPlatform'];return p&&p.videoFrame?p.videoFrame(bytes,length,kind,pts,sps,spsLength,pps,ppsLength,HEAPU8):-1; },
  ml_audio_setup: function(rate,channels,streams,coupled,samples) { var p=Module['moonlightPlatform'];return p&&p.audioSetup?p.audioSetup(rate,channels,streams,coupled,samples):-1; },
  ml_audio_frame: function(pointer,length) { var p=Module['moonlightPlatform'];if(p&&p.audioFrame)p.audioFrame(pointer,length,HEAPU8); },
  ml_random_fill: function(pointer, length) {
    var platform = Module['moonlightPlatform'];
    if (!platform || typeof platform.randomFill !== 'function') return -1;
    try {
      // The provider fills a borrowed heap view synchronously; never Math.random.
      platform.randomFill(HEAPU8.subarray(pointer, pointer + length));
      return 0;
    } catch (error) {
      return -1;
    }
  }
});
