/* Moonlight density policy: a 1600x900 workspace, sized in final CSS pixels.
 * Never transform the rendered UI or change the game's global font/rem size. */
(function(g){
 "use strict";
 function viewport(){var width=g.innerWidth||1280,height=g.innerHeight||720,scale=Math.min(width/1600,height/900);return {width:width,height:height,scale:scale};}
 function px(value){return Math.round(value*viewport().scale*100)/100;}
 function pixels(text){return text.replace(/(-?(?:\d*\.)?\d+)px/g,function(_,n){return px(Number(n))+"px";});}
 function style(node,styles){
  var sizes=node.__moonlightLayoutPixels||(node.__moonlightLayoutPixels={});
  Object.keys(styles||{}).forEach(function(key){
   var value=styles[key];
   if(typeof value==="number")value=/^(opacity|zIndex|fontWeight|flexGrow|flexShrink|order)$/.test(key)?String(value):value+"px";
   node.style[key]=typeof value==="string"?pixels(value):value;
   if(typeof value!=="string"||value.indexOf("px")<0)return;
   // Keep the live focus colour when a border shorthand is resized.
   if(/^border(?:Top|Right|Bottom|Left)?$/.test(key)){var size=value.match(/(-?(?:\d*\.)?\d+)px/);sizes[key+"Width"]=size[0];}
   else sizes[key]=value;
  });
 }
 function element(tag,parent,styles,text){var node=document.createElement(tag);style(node,styles);if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;}
 function resize(root){
  function apply(node){var sizes=node.__moonlightLayoutPixels;if(sizes)Object.keys(sizes).forEach(function(key){node.style[key]=pixels(sizes[key]);});}
  apply(root);var nodes=root.querySelectorAll("*");for(var i=0;i<nodes.length;i++)apply(nodes[i]);
 }
 g.MoonlightLayout={viewport:viewport,px:px,style:style,element:element,resize:resize};
})(typeof window!=="undefined"?window:globalThis);
