(async function(){
 var heap=new ArrayBuffer(65536),J=new Uint8Array(heap),I=new Int32Array(heap),clock=performance.now.bind(performance);
 for(var i=0;i<J.length;i++)J[i]=i*61+i/256&255;
 function byte(p){return J[p]|J[p+1|0]<<8|J[p+2|0]<<16|J[p+3|0]<<24;}
 function word(p){if((p&3)===0&&p===(p|0)&&p>=0&&p<J.length)return I[p>>2]|0;return J[p]|J[p+1|0]<<8|J[p+2|0]<<16|J[p+3|0]<<24;}
 var checks=0;
 for(var p of [-4294967296,-4,-3,-1,-.1,0,.1,1,2,3,4,4.1,16384,65532,65533,65534,65535,65536,2147483644,2147483648,4294967292,4294967296]){if(byte(p)!==word(p))throw Error('Header load mismatch '+p);checks++;}
 var runs=[];
 for(var turn=0;turn<6;turn++){var fast=!!(turn%2),begin=clock(),sum=0;
  for(var i=0;i<120000;i++){var p=(i%16000)*4;sum^=fast?word(p):byte(p);}
  runs.push({fast:fast,loads:120000,ms:clock()-begin,checksum:sum});
 }
 await log('MOONLIGHT_HEADER_LOAD_RESULT: '+JSON.stringify({checks:checks,runs:runs}));
})();
