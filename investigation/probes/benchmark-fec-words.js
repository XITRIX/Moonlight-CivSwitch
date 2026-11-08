(async function(){
 var buffer=new ArrayBuffer(131072),HEAPU8=new Uint8Array(buffer),HEAPU32=new Uint32Array(buffer),row=0,a=65536,b=73728,n=1408,clock=performance.now.bind(performance);
 function byte(a,b,row,k,add){    var h=HEAPU8,end=a+k,bulk=end-7;
    if(add){
      for(;a<bulk;a+=8,b+=8){h[a]^=h[row+h[b]];h[a+1]^=h[row+h[b+1]];h[a+2]^=h[row+h[b+2]];h[a+3]^=h[row+h[b+3]];h[a+4]^=h[row+h[b+4]];h[a+5]^=h[row+h[b+5]];h[a+6]^=h[row+h[b+6]];h[a+7]^=h[row+h[b+7]];}
      for(;a<end;a++,b++)h[a]^=h[row+h[b]];
    }else{
      for(;a<bulk;a+=8,b+=8){h[a]=h[row+h[b]];h[a+1]=h[row+h[b+1]];h[a+2]=h[row+h[b+2]];h[a+3]=h[row+h[b+3]];h[a+4]=h[row+h[b+4]];h[a+5]=h[row+h[b+5]];h[a+6]=h[row+h[b+6]];h[a+7]=h[row+h[b+7]];}
      for(;a<end;a++,b++)h[a]=h[row+h[b]];
    }}
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

 for(var i=0;i<HEAPU8.length;i++)HEAPU8[i]=(i*61+(i>>>8)*17)&255;
 var source=HEAPU8.slice(b,b+1424);function reset(){HEAPU8.fill(87,a,a+1424);HEAPU8.set(source,b);}
 var checks=0;
 for(var coefficient of [0,1,2,17,127,255])for(var offsets of [[0,0],[1,1],[2,2],[3,3],[1,3]])for(var size of [0,1,3,4,7,31,255,1408])for(var add of [0,1]){
  reset();byte(a+offsets[0],b+offsets[1],coefficient*256,size,add);var expected=HEAPU8.slice(a,a+1424);
  reset();word(a+offsets[0],b+offsets[1],coefficient*256,size,add);
  for(var i=0;i<expected.length;i++)if(expected[i]!==HEAPU8[a+i])throw Error('Word mismatch');checks++;
 }
 var runs=[];
 for(var turn=0;turn<6;turn++){var fn=turn%2?word:byte;reset();var begin=clock();for(var repeat=0;repeat<4;repeat++)for(var u=0;u<256;u++)fn(a,b,u*256,n,1);runs.push({word:!!(turn%2),ms:clock()-begin});}
 await log('MOONLIGHT_FEC_WORD_RESULT: '+JSON.stringify({checks:checks,runs:runs}));
})();
