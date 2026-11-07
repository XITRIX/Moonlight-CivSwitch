(async function(){
 var N=window.MoonlightProbeNative;
 for(var source of ["mainExports","exports"]){var found=Object.entries(N[source]).filter(function(pair){return source==="mainExports" && /cohtml|renoir|UserImage|Texture|ImageData|Surface|Graphic|MapBuffer|NV12|RGBA/i.test(pair[0]) && !/ThirdParty|sRGB|NormalMap|TypeInfo|_ZT|D[012]Ev/.test(pair[0]);}).sort(function(a,b){return a[0].localeCompare(b[0]);});await log("MOONLIGHT_RENDER_"+source+": "+JSON.stringify({count:found.length,symbols:found.map(function(pair){return {name:pair[0],offset:pair[1].offset,size:pair[1].size};})}));}
 delete window.MoonlightProbeNative;
})();
