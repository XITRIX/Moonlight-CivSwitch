/* Disposable PNG cache. The native adapter confines these names to artwork/. */
(function(global){
 "use strict";
 var maxBytes=16*1024*1024,maxImage=2097152,maxEntries=256;
 function digest(value){return global.forge.md.sha256.create().update(value).digest().toHex();}
 function create(fs,options){
  options=options||{};var limit=options.limitBytes||maxBytes,entries=null;
  // Keep save-filesystem path components short (60 characters including .png).
  function filename(key){if(!/^[0-9a-f]{64}$/.test(key))throw Error("Invalid artwork cache key");return key.slice(0,56)+".png";}
  function load(){
   if(entries)return;
   try{
    var text=fs.read("index.json",65536);
    if(text===null){fs.clear();fs.commit();entries=[];return;}
    var value=JSON.parse(text),seen=new Set(),bytes=0;
    if(!value||value.version!==1||!Array.isArray(value.entries)||value.entries.length>maxEntries)throw Error("Invalid cache index");
    for(var entry of value.entries){
     if(!entry||!/^[0-9a-f]{64}$/.test(entry.key)||seen.has(entry.key)||!Number.isSafeInteger(entry.bytes)||entry.bytes<33||entry.bytes>maxImage||!Number.isSafeInteger(entry.used)||entry.used<0||!/^[0-9a-f]{64}$/.test(entry.digest))throw Error("Invalid cache entry");
     seen.add(entry.key);bytes+=entry.bytes;
    }
    if(bytes>limit)throw Error("Cache quota exceeded");entries=value.entries;
   }catch(_){fs.clear();fs.commit();entries=[];}
  }
  function save(){fs.ensureDirectory();fs.write("index.json",JSON.stringify({version:1,entries:entries}));fs.commit();}
  function remove(key){
   var index=entries.findIndex(function(entry){return entry.key===key;});if(index<0)return;
   fs.remove(filename(key));entries.splice(index,1);save();
  }
  return {
   get:function(key){
    filename(key);load();var entry=entries.find(function(item){return item.key===key;});if(!entry)return null;
    var bytes=fs.read(filename(key),maxImage);
    if(typeof bytes!=="string"||bytes.length!==entry.bytes||digest(bytes)!==entry.digest){remove(key);return null;}
    entry.used=Date.now();return bytes;
   },
   put:function(key,bytes){
    var name=filename(key);if(typeof bytes!=="string"||bytes.length<33||bytes.length>Math.min(maxImage,limit))throw Error("Invalid cached artwork size");
    load();var old=entries.find(function(item){return item.key===key;}),total=entries.reduce(function(sum,item){return sum+item.bytes;},0)-(old?old.bytes:0);
    entries.sort(function(a,b){return a.used-b.used;});
    while(total+bytes.length>limit||entries.length-(old?1:0)>=maxEntries){
     var victim=entries.find(function(item){return item.key!==key;});if(!victim)throw Error("Artwork cache quota exceeded");
     fs.remove(filename(victim.key));entries=entries.filter(function(item){return item!==victim;});total-=victim.bytes;
    }
    fs.ensureDirectory();fs.write(name,bytes);
    // Readback catches short writes before the index points at this PNG.
    if(fs.read(name,maxImage)!==bytes)throw Error("Artwork cache write verification failed");
    entries=entries.filter(function(item){return item.key!==key;});entries.push({key:key,bytes:bytes.length,used:Date.now(),digest:digest(bytes)});save();
   },
   remove:function(key){filename(key);load();remove(key);}
  };
 }
 global.MoonlightArtworkStore={create:create};
})(typeof window!=="undefined"?window:globalThis);
