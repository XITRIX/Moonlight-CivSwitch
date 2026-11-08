(async function(){
 var heap=new ArrayBuffer(65536),J=new Uint8Array(heap),I=new Int32Array(heap),V=new DataView(heap),clock=performance.now.bind(performance);
 for(var i=0;i<J.length;i++)J[i]=i*61+i/256&255;
 function word(p){if((p&3)===0&&p>=0&&p<J.length)return I[p>>2]|0;return J[p]|J[p+1|0]<<8|(J[p+2|0]<<16|J[p+3|0]<<24);}
 function view(p){if(p>=0&&p+4<=J.length)return V.getInt32(p,true);return J[p]|J[p+1|0]<<8|(J[p+2|0]<<16|J[p+3|0]<<24);}
 function baseline(){var sum=0;for(var i=0;i<120000;i++){var p=(i%16000)*4+(i%4===1?1:0);sum^=J[p]|J[p+1|0]<<8|(J[p+2|0]<<16|J[p+3|0]<<24);}return sum;}
 function words(){var sum=0;for(var i=0;i<120000;i++){var p=(i%16000)*4+(i%4===1?1:0);sum^=word(p);}return sum;}
 function views(){var sum=0;for(var i=0;i<120000;i++){var p=(i%16000)*4+(i%4===1?1:0);sum^=view(p);}return sum;}
 var checks=0;
 for(var p of [-2147483648,-4,-3,-1,0,1,2,3,4,16384,65532,65533,65534,65535,65536,2147483647]){var expected=J[p]|J[p+1|0]<<8|(J[p+2|0]<<16|J[p+3|0]<<24);if(word(p)!==expected||view(p)!==expected)throw Error('Load mismatch '+p);checks++;}
 var runs=[],fns=[baseline,words,views],expected=baseline();
 for(var turn=0;turn<9;turn++){var mode=turn%3,begin=clock(),sum=fns[mode]();if(sum!==expected)throw Error('Checksum');runs.push({mode:['byte-inline','word-helper','view-helper'][mode],loads:120000,ms:clock()-begin});}
 await log('MOONLIGHT_HEADER_INLINE_RESULT: '+JSON.stringify({checks:checks,runs:runs}));
})();
