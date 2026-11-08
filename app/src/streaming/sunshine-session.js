/* Launch negotiation follows Moonlight Embedded's gs_start_app. */
(function(global){
 "use strict";
 function bytes(options,n){
  var source=options.randomBytes(n);if(!source||source.length!==n)throw Error("Missing native secure random bytes");
  return Uint8Array.from(source,function(v,i){var b=typeof source==="string"?source.charCodeAt(i):v;if(!Number.isInteger(b)||b<0||b>255)throw Error("Invalid secure random bytes");return b;});
 }
 function hex(array){return Array.from(array,function(v){return ("0"+v.toString(16)).slice(-2);}).join("");}
 function field(root,name,optional){
  var nodes=root.children.filter(function(n){return n.name===name;});
  if(nodes.length>1||(!nodes.length&&!optional)||(nodes.length&&nodes[0].children.length))throw Error("Invalid Sunshine field: "+name);
  return nodes.length?nodes[0].text.trim():"";
 }
 function create(options){
  function check(){if(options.signal&&options.signal.aborted)throw Error("Stream canceled");}
  async function launch(input,appId,mode,extra){
   if(!Number.isInteger(appId)||appId<1||appId>0xffffffff)throw Error("Invalid application ID");
   if(!mode||![mode.width,mode.height,mode.fps,mode.bitrate].every(Number.isInteger)||mode.width<64||mode.width>1920||mode.height<64||mode.height>1080||mode.fps<1||mode.fps>60||mode.bitrate<128||mode.bitrate>10000)throw Error("Invalid prototype stream mode");
   var address=global.MoonlightPairing.parseHost(input),identity=await options.loadIdentity(),host=await options.loadHost(address.key);check();
   if(!identity||!host||!host.certificatePem||host.uniqueId!==identity.uniqueId)throw Error("Pair with this host first");
   if(!/^\d+\.\d+\.\d+\.\d+$/.test(address.host))throw Error("The streaming adapter currently requires an IPv4 address");
   if(!Number.isInteger(host.httpsPort)||host.httpsPort<1||host.httpsPort>65535)throw Error("Invalid paired HTTPS port");
   async function request(path){
    check();var uuidBytes=bytes(options,16);uuidBytes[6]=(uuidBytes[6]&15)|64;uuidBytes[8]=(uuidBytes[8]&63)|128;var h=hex(uuidBytes);
    var uuid=h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
    var xml=await options.requestHttps({host:address.host,port:host.httpsPort,path:path+(path.indexOf("?")<0?"?":"&")+"uniqueid="+encodeURIComponent(identity.uniqueId)+"&uuid="+uuid,
     identity:identity,pinnedCertificatePem:host.certificatePem,timeoutMs:15000,signal:options.signal,maxResponseBytes:131072});
    check();var root=global.MoonlightApps.parseRoot(xml,true);
    if(root.attributes.status_code!=="200")throw Error("Sunshine "+path.split("?")[0]+" returned "+root.attributes.status_code+": "+(root.attributes.status_message||"Request rejected"));
    return root;
   }
   var info=await request("/serverinfo");
   if(field(info,"PairStatus")!=="1")throw Error("Sunshine no longer recognizes this pairing");
   var version=field(info,"appversion"),current=field(info,"currentgame"),state=field(info,"state"),codec=field(info,"ServerCodecModeSupport",true);
   if(!/^\d+(?:\.-?\d+){1,3}$/.test(version)||!/^\d+$/.test(current)||Number(current)>0xffffffff||codec&&!/^\d+$/.test(codec))throw Error("Invalid Sunshine server information");
   var resume=state.indexOf("_SERVER_BUSY")>=0&&Number(current)!==0;
   if(resume&&Number(current)!==appId)throw Error("Another application is running on the host; select that application to resume it");
   var key=bytes(options,16),id=bytes(options,4),keyId=new DataView(id.buffer).getUint32(0,false);
   // Never log this URL: rikey is a session secret.
   var path="/"+(resume?"resume":"launch")+"?appid="+appId+"&mode="+mode.width+"x"+mode.height+"x"+mode.fps+
    "&additionalStates=1&sops=0&rikey="+hex(key)+"&rikeyid="+keyId+"&localAudioPlayMode=0&surroundAudioInfo=196610&remoteControllersBitmap=1&gcmap=1"+(extra||"");
   var response=await request(path),accepted=field(response,resume?"resume":"gamesession",true);
   if(!accepted||accepted==="0")throw Error("Sunshine did not start the stream");
   var url=field(response,"sessionUrl0");
   // Keep both encrypted and plain RTSP on the paired host.
   var match=/^rtsp(?:enc)?:\/\/([^/:\s]+):(\d{1,5})(?:\/[^\s]*)?$/.exec(url);
   if(!match||match[1]!==address.host||Number(match[2])<1||Number(match[2])>65535||url.length>1000)throw Error("Unsupported Sunshine RTSP session URL");
   return {host:address.host,version:version,codecSupport:codec?Number(codec):1,url:url,key:key,keyId:keyId,resumed:resume};
  }
  return {launch:launch};
 }
 global.MoonlightSessionProtocol={create:create};
})(typeof window!=="undefined"?window:globalThis);
