mergeInto(LibraryManager.library, {
  ml_io_video_batch: function(fd,pointers,lengths,metadata,count,capacity) {
    var p=Module['moonlightPlatform'];
    return p&&p.receiveVideoBatch?p.receiveVideoBatch(fd,pointers,lengths,metadata,count,capacity,HEAPU8)|0:-38;
  },
  ml_fec_pair_table: function(base,coefficient) {
    if(coefficient<0){delete Module['moonlightFecPairs'];delete Module['moonlightFecPairBase'];return;}
    var tables=Module['moonlightFecPairs'];
    if(!tables){tables=Module['moonlightFecPairs']=new Array(256);Module['moonlightFecPairBase']=base;}
    if(tables[coefficient])return;
    var h=HEAPU8,row=base+coefficient*256,table=new Uint16Array(65536);
    for(var hi=0;hi<256;hi++){var top=h[row+hi]<<8,offset=hi*256;for(var lo=0;lo<256;lo++)table[offset+lo]=top|h[row+lo];}
    tables[coefficient]=table;
  },
  // Keep large byte loops in synchronous typed-array code. C row boundaries
  // hold the cooperative checkpoints.
  ml_fec_vector: function(a,b,row,k,add) {
    var h=HEAPU8,end=a+k;if(!k)return;
    // Packet shards have matching alignment. Pack four field products per store;
    // matrix rows and mismatched offsets keep the byte path.
    if(((a^b)&3)===0){
      for(;a<end&&(a&3);a++,b++){var value=h[row+h[b]];h[a]=add?h[a]^value:value;}
      if(a>=end)return;
      var words=HEAPU32,ai=a>>>2,bi=b>>>2,limit=end>>>2;
      var pairs=Module['moonlightFecPairs'],table=pairs&&pairs[(row-Module['moonlightFecPairBase'])>>>8];
      if(table){
        if(add){for(;ai<limit;ai++,bi++){var x=words[bi];words[ai]^=table[x&65535]|(table[x>>>16]<<16);}}
        else{for(;ai<limit;ai++,bi++){var x=words[bi];words[ai]=table[x&65535]|(table[x>>>16]<<16);}}
      }
      else if(add){for(;ai<limit;ai++,bi++){var x=words[bi];words[ai]^=h[row+(x&255)]|(h[row+((x>>>8)&255)]<<8)|(h[row+((x>>>16)&255)]<<16)|(h[row+(x>>>24)]<<24);}}
      else{for(;ai<limit;ai++,bi++){var x=words[bi];words[ai]=h[row+(x&255)]|(h[row+((x>>>8)&255)]<<8)|(h[row+((x>>>16)&255)]<<16)|(h[row+(x>>>24)]<<24);}}
      a=ai*4;b=bi*4;
    }
    if(add){for(;a<end;a++,b++)h[a]^=h[row+h[b]];}
    else{for(;a<end;a++,b++)h[a]=h[row+h[b]];}
  },
  ml_io: function(op,a,b,c,d,e,f) {
    var p=Module['moonlightPlatform'];
    if(!p||typeof p.io!=='function')return -38;
    return p.io(op,[a,b,c,d,e,f],HEAPU8)|0;
  },
  ml_log__deps: ['$UTF8ToString'],
  ml_log: function(pointer) { var p=Module['moonlightPlatform'];if(p&&p.log)p.log(UTF8ToString(pointer)); },
  ml_event: function(event,a,b) { var p=Module['moonlightPlatform'];if(p&&p.event)p.event(event,a,b); },
  ml_rumble: function(controller,low,high) {
    var p=Module['moonlightPlatform'];
    // A failed or disconnected output must never unwind the cooperative C stack.
    try { if(p&&typeof p.rumble==='function')p.rumble(controller,low,high); } catch(error) {}
  },
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
