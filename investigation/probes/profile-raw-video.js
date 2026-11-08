/* A bounded receive-only window isolates native/LAN delivery from C video work.
   It intentionally discards video for eight seconds, then resumes normal input.
   All diagnostic output is retained in the existing post-stop IO snapshot. */
(function(){
 var make=window.MoonlightStreamIO.create,now=window.MoonlightTelemetry.now;
 window.MoonlightStreamIO.create=function(t,o){
  var io=make(t,o),receive=io.io,first=0,view=null,last=-1;
  var stats={seconds:8,packets:0,bytes:0,forwardGaps:0,outOfOrder:0,duplicates:0,firstAt:0,lastAt:0};io.stats.rawVideo=stats;
  io.io=function(op,args,heap){
   if(op!==5||args[2]!==1408||io.isInterrupted())return receive(op,args,heap);
   if(!first)first=now();var elapsed=now()-first;
   if(elapsed<3000||elapsed>=11000)return receive(op,args,heap);
   if(!view||view.buffer!==heap.buffer)view=new DataView(heap.buffer);
   var end=now()+2,n=0;
   do{
    var count=receive(op,args,heap);if(count<0)return count;
    if(count>=16&&heap[args[1]]===0x90){
     var stamp=now(),seq=view.getUint16(args[1]+2,false);
     if(!stats.firstAt)stats.firstAt=stamp;stats.lastAt=stamp;
     stats.packets++;stats.bytes+=count;
     if(last>=0){var delta=(seq-last)&65535;if(!delta)stats.duplicates++;else if(delta<32768){stats.forwardGaps+=delta-1;last=seq;}else stats.outOfOrder++;}
     else last=seq;
    }
   }while(++n<256&&now()<end);
   return -11;
  };
  return io;
 };
})();
