(async function(){
 var buffer=new ArrayBuffer(131072),HEAPU8=new Uint8Array(buffer),HEAPU32=new Uint32Array(buffer),a=65536,b=73728,n=1408,clock=performance.now.bind(performance);
 function word(a,b,row,k,add){    var h=HEAPU8,end=a+k;if(!k)return;
    // Packet shards have matching alignment. Pack four field products per store;
    // matrix rows and mismatched offsets keep the byte path.
    if(((a^b)&3)===0){
      for(;a<end&&(a&3);a++,b++){var value=h[row+h[b]];h[a]=add?h[a]^value:value;}
      if(a>=end)return;
      var words=HEAPU32,ai=a>>>2,bi=b>>>2,limit=end>>>2;
      if(add){for(;ai<limit;ai++,bi++){var x=words[bi];words[ai]^=h[row+(x&255)]|(h[row+((x>>>8)&255)]<<8)|(h[row+((x>>>16)&255)]<<16)|(h[row+(x>>>24)]<<24);}}
      else{for(;ai<limit;ai++,bi++){var x=words[bi];words[ai]=h[row+(x&255)]|(h[row+((x>>>8)&255)]<<8)|(h[row+((x>>>16)&255)]<<16)|(h[row+(x>>>24)]<<24);}}
      a=ai*4;b=bi*4;
    }
    if(add){for(;a<end;a++,b++)h[a]^=h[row+h[b]];}
    else{for(;a<end;a++,b++)h[a]=h[row+h[b]];}}

 var tables=[];
 function paired(a,b,row,k,add){
  if(((a|b|k)&3)!==0)return word(a,b,row,k,add);
  var table=tables[row>>>8],words=HEAPU32,ai=a>>>2,bi=b>>>2,end=(a+k)>>>2;
  if(add){for(;ai<end;ai++,bi++){var x=words[bi];words[ai]^=table[x&65535]|(table[x>>>16]<<16);}}
  else{for(;ai<end;ai++,bi++){var x=words[bi];words[ai]=table[x&65535]|(table[x>>>16]<<16);}}
 } function unrolled(a,b,row,k,add){
  if(((a|b|k)&3)!==0)return word(a,b,row,k,add);
  var table=tables[row>>>8],words=HEAPU32,ai=a>>>2,bi=b>>>2,end=(a+k)>>>2;
  if(add){for(;ai+3<end;ai+=4,bi+=4){var x=words[bi+0];words[ai+0]^=table[x&65535]|(table[x>>>16]<<16);var x=words[bi+1];words[ai+1]^=table[x&65535]|(table[x>>>16]<<16);var x=words[bi+2];words[ai+2]^=table[x&65535]|(table[x>>>16]<<16);var x=words[bi+3];words[ai+3]^=table[x&65535]|(table[x>>>16]<<16);}for(;ai<end;ai++,bi++){var x=words[bi];words[ai]^=table[x&65535]|(table[x>>>16]<<16);}}
  else{for(;ai+3<end;ai+=4,bi+=4){var x=words[bi+0];words[ai+0]=table[x&65535]|(table[x>>>16]<<16);var x=words[bi+1];words[ai+1]=table[x&65535]|(table[x>>>16]<<16);var x=words[bi+2];words[ai+2]=table[x&65535]|(table[x>>>16]<<16);var x=words[bi+3];words[ai+3]=table[x&65535]|(table[x>>>16]<<16);}for(;ai<end;ai++,bi++){var x=words[bi];words[ai]=table[x&65535]|(table[x>>>16]<<16);}}
 }
 for(var i=0;i<HEAPU8.length;i++)HEAPU8[i]=(i*61+(i>>>8)*17)&255;
 var prepStart=clock();
 for(var u=0;u<256;u++){
  var t=new Uint16Array(65536),row=u*256;
  for(var hi=0;hi<256;hi++){var top=HEAPU8[row+hi]<<8,base=hi*256;for(var lo=0;lo<256;lo++)t[base+lo]=top|HEAPU8[row+lo];}
  tables.push(t);
  if((u&7)===7)await new Promise(function(r){setTimeout(r,0);});
 }
 var prepMs=clock()-prepStart,checks=0;
 var source=HEAPU8.slice(b,b+1424);function reset(){HEAPU8.fill(87,a,a+1424);HEAPU8.set(source,b);}
 for(var u=0;u<256;u++)for(var add of [0,1]){
  reset();word(a,b,u*256,n,add);var expected=HEAPU8.slice(a,a+n);
  reset();unrolled(a,b,u*256,n,add);for(var i=0;i<n;i++)if(HEAPU8[a+i]!==expected[i])throw Error('Pair lookup mismatch');checks++;
 }
 var runs=[];
 for(var turn=0;turn<6;turn++){var fn=turn%2?unrolled:paired;reset();var begin=clock();for(var repeat=0;repeat<4;repeat++)for(var u=0;u<256;u++)fn(a,b,u*256,n,1);runs.push({unrolled:!!(turn%2),ms:clock()-begin});}
 await log('MOONLIGHT_FEC_PAIR_UNROLLED_RESULT: '+JSON.stringify({checks:checks,prepMs:prepMs,bytes:33554432,runs:runs}));
})();
