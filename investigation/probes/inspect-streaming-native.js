/* SDK inventory via verified read primitives, private-buffer checks and UDP. */
(async function(){
    async function out(name,value){await log("MOONLIGHT_STREAM_NATIVE_"+name+": "+JSON.stringify(value));}
    function pause(ms){return new Promise(function(done){setTimeout(done,ms);});}
    var base=sdk_base,mod=base+read32(base+4n),dynamic=mod+BigInt.asIntN(32,read32(mod+4n)),tags={};
    for(var i=0;i<128;i++){var tag=Number(read64(dynamic+BigInt(i*16)));if(!tag)break;var value=read64(dynamic+BigInt(i*16+8));tags[tag]=value;}
    [4,5,6].forEach(function(tag){if(tags[tag]<base)tags[tag]+=base;});
    var count=Number(read32(tags[4]+4n)),stringSize=Number(tags[10]);
    if(count<1||count>100000||stringSize<1||stringSize>8388608)throw Error("Unexpected SDK symbol bounds");
    var bulk=typeof get_backing_store==="function"&&typeof memcpy_addr!=="undefined";
    await out("BULK_PREREQUISITES",{bulk:bulk,symbols:count,stringBytes:stringSize});
    function copyFrom(pointer,length){
        var bytes=new Uint8Array(length),view=new DataView(bytes.buffer),n=0;
        for(;n+8<=length;n+=8)view.setBigUint64(n,read64(pointer+BigInt(n)),true);
        for(;n<length;n++)bytes[n]=Number(read8(pointer+BigInt(n)));
        return bytes;
    }
    function nameAt(bytes,offset){var name="";while(offset<bytes.length&&bytes[offset])name+=String.fromCharCode(bytes[offset++]);return name;}
    var exports={};
    if(bulk){
        var entries=copyFrom(tags[6],count*24),strings=copyFrom(tags[5],stringSize),data=new DataView(entries.buffer);
        for(var n=0;n<count;n++){
            var name=nameAt(strings,data.getUint32(n*24,true)),offset=data.getBigUint64(n*24+8,true),size=data.getBigUint64(n*24+16,true);
            if(offset)exports[name]={address:base+offset,offset:offset.toString(16),size:Number(size)};
        }
    }else throw Error("Bulk reader unavailable; refusing an unbounded byte-at-a-time inventory");
    function call(name,args){if(!exports[name])throw Error("Missing export "+name);return call_rop.apply(null,[exports[name].address].concat((args||[]).map(BigInt)));}
    var groups={socket:[],threads:[],audio:[],video:[],gpu:[],code:[],clock:[],v8:[]};
    Object.keys(exports).forEach(function(name){
        var group=/^(_ZN|nn).*socket.*(SendTo|RecvFrom|Bind|GetSockName|SetSockOpt|Poll|Select)/.test(name)?"socket":
            /nn.*(os.*(CreateThread|StartThread|WaitThread|DestroyThread|InitializeMutex|LockMutex|ConditionVariable)|pthread)/.test(name)?"threads":
            /nn.*audio.*(AudioOut|AudioRenderer|Opus|WaveBuffer|MixBuffer)/.test(name)?"audio":
            /(nvdec|nvmpi|nvmedia|avcodec|h264|H264|VideoDecoder|movie|MediaDecoder|Decoder.*Video|Video.*Decoder)/i.test(name)?"video":
            /^(nvn|nvgl|NvRm|nvMap)/.test(name)?"gpu":
            /(SetMemoryPermission|QueryMemory|CreateCodeMemory|ControlCodeMemory|MapProcessCodeMemory|UnmapProcessCodeMemory|LoadModule|RegisterModuleInfo|Jit|jit)/.test(name)?"code":
            /nn.*os.*(GetSystemTick|GetSystemTime|GetMonotonic)/.test(name)?"clock":
            /(wasm|WebAssembly|v8.*SetFlags|v8.*Wasm|v8.*Compile)/i.test(name)?"v8":null;
        if(group)groups[group].push({name:name,offset:exports[name].offset,size:exports[name].size});
    });
    for(var group of Object.keys(groups))await out("EXPORTS_"+group.toUpperCase(),groups[group]);
    // Do not call memcpy on typed-array pointers: the loader helper has not
    // been validated for normal typed arrays. Inspect fields without dereferencing them.
    var array=new Uint8Array(65536),object=addrof_compressed(array),fields={};
    for(var field=0x0c;field<=0x38;field+=4)fields["0x"+field.toString(16)]=read32_compressed(object+BigInt(field)).toString(16);
    await out("TYPED_ARRAY_FIELDS",fields);
    var p=malloc(1048576);
    try{
        var sentinel=new Uint8Array(256);for(var j=0;j<sentinel.length;j++)sentinel[j]=(j*17+91)&255;
        write_buffer(p,sentinel);
        var started=Date.now(),actual=copyFrom(p,1048576),elapsed=Date.now()-started,mismatch=-1;
        for(var j=0;j<sentinel.length;j++)if(sentinel[j]!==actual[j]){mismatch=j;break;}
        await out("WORD_COPY",{bytes:actual.length,readMs:elapsed,mismatch:mismatch});
    }finally{free(p);}
    function signed(value){return Number(BigInt.asIntN(32,value));}
    var a=-1n,b=-1n,address=malloc(16),addressLength=malloc(8),sendBuffer=malloc(1500),recvBuffer=malloc(1500);
    try{
        a=BigInt(signed(call("_ZN2nn6socket6SocketEiii",[2,2,0])));b=BigInt(signed(call("_ZN2nn6socket6SocketEiii",[2,2,0])));
        if(a<0n||b<0n)throw Error("UDP socket creation failed");
        for(var fd of [a,b]){var flags=signed(call("_ZN2nn6socket5FcntlEiiz",[fd,3,0]));if(signed(call("_ZN2nn6socket5FcntlEiiz",[fd,4,flags|0x800]))<0)throw Error("UDP nonblocking mode failed");}
        write_buffer(address,new Uint8Array([16,2,0,0,127,0,0,1,0,0,0,0,0,0,0,0]));
        var bind=signed(call("_ZN2nn6socket4BindEiPK8sockaddrj",[b,address,16]));if(bind<0)throw Error("UDP bind failed");
        write32(addressLength,16n);var got=signed(call("_ZN2nn6socket11GetSockNameEiP8sockaddrPj",[b,address,addressLength]));if(got<0)throw Error("UDP getsockname failed");
        var connected=signed(call("_ZN2nn6socket7ConnectEiPK8sockaddrj",[a,address,16]));if(connected<0)throw Error("UDP connect failed");
        var payload=new Uint8Array(1200);for(var j=0;j<payload.length;j++)payload[j]=(j*31+17)&255;
        write_buffer(sendBuffer,payload);
        var begin=Date.now(),written=signed(call("_ZN2nn6socket4SendEiPKvmi",[a,sendBuffer,1200,0x80])),received=-1;
        while(Date.now()-begin<1000){received=signed(call("_ZN2nn6socket4RecvEiPvmi",[b,recvBuffer,1500,0x80]));if(received>=0)break;await pause(10);}
        var actual=received>0?copyFrom(recvBuffer,received):new Uint8Array(0),match=actual.length===payload.length;
        for(var j=0;j<actual.length;j++)if(actual[j]!==payload[j])match=false;
        await out("UDP_LOOPBACK",{bind:bind,connected:connected,sent:written,received:received,match:match,elapsedMs:Date.now()-begin});
    }catch(error){await out("UDP_ERROR",String(error.message||error));}
    finally{for(var fd of [a,b])if(fd>=0n)call("_ZN2nn6socket5CloseEi",[fd]);for(var ptr of [address,addressLength,sendBuffer,recvBuffer])free(ptr);}
    // Read-only type/property inventory, never invoke unknown game handlers.
    var apis={};for(var name of ["Sound","UI","engine","Configuration","Network"]){try{apis[name]=window[name]?Object.getOwnPropertyNames(window[name]).filter(function(v){return /audio|sound|video|media|movie|texture|canvas|stream|volume|v8|wasm|worker/i.test(v);}):null;}catch(e){apis[name]=String(e);}}
    await out("GAME_APIS",apis);
    var v8=typeof window.v8Version;await out("V8_CALLBACK",{type:v8,note:"Loader owns this callback; not called directly by probe."});
    await out("END",true);
})();
