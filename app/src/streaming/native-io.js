/* Translate the generated core's wasm32 socket ABI into CivSwitch SDK calls. */
(function(global){
 "use strict";
 function create(transport){
  var allocations=[],descriptors=new Set(),bufferSize=2097152,heapBuffer=null,heapAddress=0n,socketTypes={};
  function alloc(size){var p=malloc(size);if(!p)throw Error("Native streaming allocation failed");allocations.push(p);return p;}
  function invoke(name,args){return call_rop.apply(null,[transport.resolveNativeSymbol(name)].concat((args||[]).map(BigInt)));}
  function signed(value){return Number(BigInt.asIntN(32,value));}
  function call(name,args){var result=signed(invoke("_ZN2nn6socket"+name,args));return result<0?-Number(invoke("_ZN2nn6socket12GetLastErrnoEv",[])):result;}
  function copy(pointer,length){var bytes=new Uint8Array(length),view=new DataView(bytes.buffer),i=0;for(;i+8<=length;i+=8)view.setBigUint64(i,read64(pointer+BigInt(i)),true);for(;i<length;i++)bytes[i]=Number(read8(pointer+BigInt(i)));return bytes;}
  var scratch=alloc(bufferSize),address=alloc(128),addressLength=alloc(8),optionBuffer=alloc(128),optionLength=alloc(8),pollBuffer=alloc(64*8);
  var stats={calls:0,sentBytes:0,receivedBytes:0,lastError:0,rtpTypes:{}};
  function bounds(heap,pointer,length){pointer=pointer>>>0;if(!Number.isInteger(length)||length<0||pointer+length>heap.length)throw Error("Streaming heap range rejected");return pointer;}
  function base(heap){
   if(heap.buffer===heapBuffer)return heapAddress;
   if(heap.byteOffset!==0)throw Error("Expected complete core heap view");
   var object=addrof_compressed(heap),external=read64_compressed(object+0x28n),compressedBase=read32_compressed(object+0x30n);
   if(compressedBase!==0n||external<0x100000000n||external>=0x8000000000n)throw Error("Core heap is not a validated external buffer");
   var bytes=copy(external,32);for(var i=0;i<32;i++)if(bytes[i]!==heap[i])throw Error("Core heap pointer verification failed");
   heapBuffer=heap.buffer;heapAddress=external;return external;
  }
  function toNative(heap,pointer,length,destination){pointer=bounds(heap,pointer,length);if(length)call_rop(memcpy_addr,destination,base(heap)+BigInt(pointer),BigInt(length));}
  function fromNative(heap,pointer,length,source){pointer=bounds(heap,pointer,length);if(length)call_rop(memcpy_addr,base(heap)+BigInt(pointer),source,BigInt(length));}
  function inputAddress(heap,pointer,length){
   bounds(heap,pointer,length);if(length<16||heap[pointer]!==2||heap[pointer+1]!==0)return false;
   var bytes=new Uint8Array(16);bytes.set(heap.subarray(pointer,pointer+16));bytes[0]=16;bytes[1]=2;write_buffer(address,bytes);return true;
  }
  function outputAddress(heap,pointer,lengthPointer){
   if(!pointer||!lengthPointer)return;
   bounds(heap,lengthPointer,4);var view=new DataView(heap.buffer),capacity=view.getUint32(lengthPointer,true),length=Math.min(capacity,16);
   bounds(heap,pointer,length);var bytes=copy(address,16);bytes[0]=2;bytes[1]=0;heap.set(bytes.subarray(0,length),pointer);view.setUint32(lengthPointer,16,true);
  }
  function nativeOption(level,option){
   if(level===1)return [0xffff,({2:4,4:0x1007,6:0x20,7:0x1001,8:0x1002,9:8,15:0x200})[option]||option];
   if(level===0)return [0,({1:3,2:4})[option]||option];
   return [level,option];
  }
  function io(op,args,heap){
   stats.calls++;var a=args[0],b=args[1]>>>0,c=args[2]>>>0,d=args[3],e=args[4]>>>0,f=args[5]>>>0,result;
   try{
    if(op===1){
     if(a!==2)return -97;
     result=call("6SocketEiii",[a,b,c]);
     if(result>=0){var fd=result,flags=call("5FcntlEiiz",[fd,3,0]);result=flags<0?flags:call("5FcntlEiiz",[fd,4,flags|0x800]);if(result<0)call("5CloseEi",[fd]);else{descriptors.add(fd);socketTypes[fd]=b;result=fd;}}
    }else if(op===2||op===3){
     if(!inputAddress(heap,b,c))return -97;
     result=call(op===2?"4BindEiPK8sockaddrj":"7ConnectEiPK8sockaddrj",[a,address,16]);
    }else if(op===4||op===5){
     if(c>bufferSize)return -90;bounds(heap,b,c);
     var flags=0x80|(d&2);
     if(op===4){
      toNative(heap,b,c,scratch);
      if(e){if(!inputAddress(heap,e,f))return -97;result=call("6SendToEiPKvmiPK8sockaddrj",[a,scratch,c,flags,address,16]);}
      else result=call("4SendEiPKvmi",[a,scratch,c,flags]);
      if(result>0)stats.sentBytes+=result;
     }else{
      write32(addressLength,16n);
      result=e?call("8RecvFromEiPvmiP8sockaddrPj",[a,scratch,c,flags,address,addressLength]):call("4RecvEiPvmi",[a,scratch,c,flags]);
      if(result>=0){fromNative(heap,b,result,scratch);outputAddress(heap,e,f);stats.receivedBytes+=result;if(socketTypes[a]===2&&result>=12){var packetType=heap[b].toString(16)+":"+heap[b+1].toString(16);stats.rtpTypes[packetType]=(stats.rtpTypes[packetType]||0)+1;}}
     }
    }else if(op===6){
     write32(addressLength,16n);result=call(d?"11GetPeerNameEiP8sockaddrPj":"11GetSockNameEiP8sockaddrPj",[a,address,addressLength]);
     if(result>=0)outputAddress(heap,b,c);
    }else if(op===7||op===8){
     var mapped=nativeOption(b,c),length=op===7?e:(bounds(heap,e,4),new DataView(heap.buffer).getUint32(e,true));
     if(length>128)return -22;bounds(heap,d>>>0,length);
     if(op===7){toNative(heap,d>>>0,length,optionBuffer);result=call("10SetSockOptEiiiPKvj",[a,mapped[0],mapped[1],optionBuffer,length]);}
     else{write32(optionLength,BigInt(length));result=call("10GetSockOptEiiiPvPj",[a,mapped[0],mapped[1],optionBuffer,optionLength]);if(result>=0){var actual=Number(read32(optionLength));if(actual>length)throw Error("Native socket option overflow");fromNative(heap,d>>>0,actual,optionBuffer);new DataView(heap.buffer).setUint32(e,actual,true);}}
    }else if(op===9)result=call("8ShutdownEii",[a,b]);
    else if(op===10){if(!descriptors.has(a))return -9;descriptors.delete(a);delete socketTypes[a];result=call("5CloseEi",[a]);}
    else if(op===11){
     if(b>64)return -22;bounds(heap,a>>>0,b*8);toNative(heap,a>>>0,b*8,pollBuffer);
     result=call("4PollEP6pollfdmi",[pollBuffer,b,0]);if(result>=0)fromNative(heap,a>>>0,b*8,pollBuffer);
    }else result=-38;
    if(result<0)stats.lastError=-result;return result;
   }catch(error){stats.lastError=5;throw error;}
  }
  return {io:io,stats:stats,invoke:invoke,copy:copy,toNative:toNative,fromNative:fromNative,heapAddress:base,
   randomFill:function(target){var p=alloc(Math.max(1,target.length));try{invoke("_ZN2nn6crypto36GenerateCryptographicallyRandomBytesEPvm",[p,target.length]);target.set(copy(p,target.length));}finally{allocations.pop();free(p);}},
   close:function(){for(var fd of descriptors)call("5CloseEi",[fd]);descriptors.clear();for(var p of allocations.reverse())free(p);allocations=[];heapBuffer=null;}
  };
 }
 global.MoonlightStreamIO={create:create};
})(window);
