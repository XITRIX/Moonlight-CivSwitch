/* ENet transport timing only: never inspect encrypted input payloads. */
(function(global){
 'use strict';
 function commands(bytes){
  if(bytes.length<2)return [];
  var header=(bytes[0]<<8)|bytes[1];if(header&0x4000)return [];
  var offset=header&0x8000?4:2,result=[],sizes=[0,8,48,44,8,4,6,8,24,8,12,16,24];
  function u16(p){return (bytes[p]<<8)|bytes[p+1];}
  for(var i=0;i<32&&offset<bytes.length;i++){
   if(offset+4>bytes.length)return [];
   var type=bytes[offset]&15,size=sizes[type];if(!size||offset+size>bytes.length)return [];
   if(type===6)size+=u16(offset+4);
   else if(type===7||type===8||type===9||type===12)size+=u16(offset+6);
   if(offset+size>bytes.length)return [];
   result.push({type:type,channel:bytes[offset+1],sequence:u16(offset+2),ack:type===1?u16(offset+4):null});offset+=size;
  }
  return offset===bytes.length?result:[];
 }
 function create(){
  var pending=[],sent=new Map(),samples=[],controlFd=null,retries=0;
  function enqueue(time){var item={queued:time,sent:null,ack:null,retries:0};pending.push(item);samples.push(item);return item;}
  function observe(op,args,heap,result,begin,end){
   var fd=args[0],p=args[1]>>>0,n=op===5?result:args[2]>>>0,remote=args[4]>>>0;
   if(result<0||n<2||p+n>heap.length)return;
   if(op===4&&remote&&remote+16<=heap.length&&((heap[remote+2]<<8)|heap[remote+3])===47999)controlFd=fd;
   if(fd!==controlFd)return;
   commands(heap.subarray(p,p+n)).forEach(function(cmd){
    if(cmd.channel!==16)return;
    if(op===4&&cmd.type===6){
     if(sent.has(cmd.sequence)){var old=sent.get(cmd.sequence);if(old){old.retries++;retries++;}return;}
     var item=pending.shift()||null;sent.set(cmd.sequence,item);
     if(item){item.sent=begin;item.sendCallMs=end-begin;item.sequence=cmd.sequence;}
    }else if(op===5&&cmd.type===1){var item=sent.get(cmd.ack);if(item&&item.ack===null)item.ack=end;}
   });
  }
  return {enqueue:enqueue,observe:observe,samples:samples,summary:function(){return {samples:samples,retries:retries,pending:pending.length,controlFd:controlFd};}};
 }
 global.MoonlightInputObserver={commands:commands,create:create};
})(typeof window!=='undefined'?window:globalThis);
