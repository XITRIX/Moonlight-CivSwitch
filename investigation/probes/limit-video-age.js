/* Experiment: discard old cleartext video RTP before entering the C queues. */
(function(){
 var make=window.MoonlightStreamIO.create;
 window.MoonlightStreamIO.create=function(t,o){
  var io=make(t,o),raw=io.io,video=new Set(),anchors=new Map(),limit=window.__moonlightMaxVideoAgeMs,clock=window.MoonlightTelemetry.now;
  io.stats.staleVideoPackets=0;io.stats.maxVideoPacketAgeMs=0;io.stats.videoAgeLimitMs=limit;
  io.io=function(op,args,heap){
   if(op===7&&args[1]===1&&args[2]===8&&args[4]===4&&new DataView(heap.buffer).getInt32(args[3],true)>1048576)video.add(args[0]);
   if(op===10){video.delete(args[0]);anchors.delete(args[0]);}
   var result=raw(op,args,heap);
   if(op!==5||!video.has(args[0])||(args[3]&2)||args[4]||result<32)return result;
   var now=clock(),view=new DataView(heap.buffer),offset=args[1]>>>0,anchor=anchors.get(args[0]);
   for(var dropped=0;dropped<128;dropped++){
    if(result<32||heap[offset]!==0x90||(heap[offset+1]&127)!==0)return result;
    var timestamp=view.getUint32(offset+4,false);
    if(!anchor){anchor={timestamp:timestamp,time:now,decisions:new Map()};anchors.set(args[0],anchor);}
    var elapsed=((timestamp-anchor.timestamp)|0)/90,age=now-anchor.time-elapsed;
    if(age<0){anchor.time=now-elapsed;age=0;}
    io.stats.maxVideoPacketAgeMs=Math.max(io.stats.maxVideoPacketAgeMs,age);
    var discard=anchor.decisions.get(timestamp);
    if(discard===undefined){discard=age>limit;anchor.decisions.set(timestamp,discard);if(anchor.decisions.size>64)anchor.decisions.delete(anchor.decisions.keys().next().value);}
    if(!discard)return result;
    io.stats.staleVideoPackets++;if(dropped===127)return -11;result=raw(op,args,heap);
   }
   return -11;
  };
  return io;
 };
})();
