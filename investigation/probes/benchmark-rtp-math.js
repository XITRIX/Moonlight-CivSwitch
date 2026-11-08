(async function(){var Math_clz32=Math.clz32,Math_imul=Math.imul,i64toi32_i32$HIGH_BITS=0;
 function __wasm_ctz_i32($0) {
  if ($0) {
   return 31 - Math_clz32($0 - 1 ^ $0) | 0
  }
  return 32;
 }
 
 function __wasm_i64_mul($0, $1, $2, $3) {
  var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
  $4 = $2 >>> 16 | 0;
  $5 = $0 >>> 16 | 0;
  $9 = Math_imul($4, $5);
  $6 = $2 & 65535;
  $7 = $0 & 65535;
  $8 = Math_imul($6, $7);
  $5 = ($8 >>> 16 | 0) + Math_imul($5, $6) | 0;
  $4 = ($5 & 65535) + Math_imul($4, $7) | 0;
  i64toi32_i32$HIGH_BITS = (Math_imul($1, $2) + $9 | 0) + Math_imul($0, $3) + ($5 >>> 16) + ($4 >>> 16) | 0;
  return $8 & 65535 | $4 << 16;
 }
 
 function __wasm_i64_udiv($0, $1, $2) {
  var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $10 = 0, $11 = 0;
  __inlined_func$_ZN17compiler_builtins3int4udiv10divmod_u6417h6026910b5ed08e40E$3 : {
   label$1 : {
    label$2 : {
     label$3 : {
      label$4 : {
       label$5 : {
        label$6 : {
         label$7 : {
          label$9 : {
           label$11 : {
            if ($1) {
             if (!$2) {
              break label$11
             }
             break label$9;
            }
            i64toi32_i32$HIGH_BITS = 0;
            $0 = ($0 >>> 0) / ($2 >>> 0) | 0;
            break __inlined_func$_ZN17compiler_builtins3int4udiv10divmod_u6417h6026910b5ed08e40E$3;
           }
           if (!$0) {
            break label$7
           }
           break label$6;
          }
          if (!($2 - 1 & $2)) {
           break label$5
          }
          $5 = (Math_clz32($2) + 33 | 0) - Math_clz32($1) | 0;
          $6 = 0 - $5 | 0;
          break label$3;
         }
         i64toi32_i32$HIGH_BITS = 0;
         $0 = ($1 >>> 0) / 0 | 0;
         break __inlined_func$_ZN17compiler_builtins3int4udiv10divmod_u6417h6026910b5ed08e40E$3;
        }
        $3 = 32 - Math_clz32($1) | 0;
        if ($3 >>> 0 < 31) {
         break label$4
        }
        break label$2;
       }
       if (($2 | 0) == 1) {
        break label$1
       }
       $5 = __wasm_ctz_i32($2);
       $2 = $5 & 31;
       if (($5 & 63) >>> 0 >= 32) {
        $0 = $1 >>> $2 | 0
       } else {
        $3 = $1 >>> $2 | 0;
        $0 = ((1 << $2) - 1 & $1) << 32 - $2 | $0 >>> $2;
       }
       i64toi32_i32$HIGH_BITS = $3;
       break __inlined_func$_ZN17compiler_builtins3int4udiv10divmod_u6417h6026910b5ed08e40E$3;
      }
      $5 = $3 + 1 | 0;
      $6 = 63 - $3 | 0;
     }
     $3 = $5 & 63;
     $4 = $3 & 31;
     if ($3 >>> 0 >= 32) {
      $3 = 0;
      $7 = $1 >>> $4 | 0;
     } else {
      $3 = $1 >>> $4 | 0;
      $7 = ((1 << $4) - 1 & $1) << 32 - $4 | $0 >>> $4;
     }
     $6 = $6 & 63;
     $4 = $6 & 31;
     if ($6 >>> 0 >= 32) {
      $1 = $0 << $4;
      $0 = 0;
     } else {
      $1 = (1 << $4) - 1 & $0 >>> 32 - $4 | $1 << $4;
      $0 = $0 << $4;
     }
     if ($5) {
      $6 = $2 - 1 | 0;
      $11 = ($6 | 0) == -1 ? -1 : 0;
      while (1) {
       $8 = $3 << 1 | $7 >>> 31;
       $3 = $7 << 1 | $1 >>> 31;
       $4 = $11 - ($8 + ($3 >>> 0 > $6 >>> 0) | 0) >> 31;
       $9 = $2 & $4;
       $7 = $3 - $9 | 0;
       $3 = $8 - ($3 >>> 0 < $9 >>> 0) | 0;
       $1 = $1 << 1 | $0 >>> 31;
       $0 = $10 | $0 << 1;
       $10 = $4 & 1;
       $5 = $5 - 1 | 0;
       if ($5) {
        continue
       }
       break;
      };
     }
     i64toi32_i32$HIGH_BITS = $1 << 1 | $0 >>> 31;
     $0 = $10 | $0 << 1;
     break __inlined_func$_ZN17compiler_builtins3int4udiv10divmod_u6417h6026910b5ed08e40E$3;
    }
    $0 = 0;
    $1 = 0;
   }
   i64toi32_i32$HIGH_BITS = $1;
  }
  return $0;
 }
 
function fastMul(a,b,c,d){if((b|d)===0&&(c>>>0)===1000){var n=(a>>>0)*1000;i64toi32_i32$HIGH_BITS=n/4294967296|0;return n|0;}return __wasm_i64_mul(a,b,c,d);}
function fastDiv(a,b,c){if((b>>>0)<1024&&(c>>>0)===90){var q=Math.floor(((b>>>0)*4294967296+(a>>>0))/90);i64toi32_i32$HIGH_BITS=q/4294967296|0;return q|0;}return __wasm_i64_udiv(a,b,c);}

var runs=[],clock=performance.now.bind(performance),checks=0;
for(var t of [0,1,89,90,0x3fffff,0x400000,0x3fffffff,0x7fffffff,0xfffffffe,0xffffffff]){
 var lo=__wasm_i64_mul(t|0,0,1000,0),hi=i64toi32_i32$HIGH_BITS,q=__wasm_i64_udiv(lo,hi,90),qh=i64toi32_i32$HIGH_BITS;
 var a=fastMul(t|0,0,1000,0),b=i64toi32_i32$HIGH_BITS,c=fastDiv(a,b,90),d=i64toi32_i32$HIGH_BITS;
 if(lo!==a||hi!==b||q!==c||qh!==d)throw Error('Arithmetic mismatch');checks++;
}
for(var turn=0;turn<6;turn++){var fast=!!(turn%2),begin=clock(),sum=0;
 for(var i=0;i<10000;i++){var timestamp=(1000000000+i*1500)|0,low=fast?fastMul(timestamp,0,1000,0):__wasm_i64_mul(timestamp,0,1000,0),high=i64toi32_i32$HIGH_BITS;sum^=fast?fastDiv(low,high,90):__wasm_i64_udiv(low,high,90);}
 runs.push({fast:fast,conversions:10000,ms:clock()-begin,checksum:sum});}
await log('MOONLIGHT_RTP_MATH_RESULT: '+JSON.stringify({checks:checks,runs:runs}));})();
