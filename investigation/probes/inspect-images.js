/* Read-only, auto-closing Gameface image-loader probe. */
(async function(){
 var root=document.createElement("div");Object.assign(root.style,{position:"fixed",left:"20px",top:"20px",padding:"20px",backgroundColor:"#131d2e",color:"white",zIndex:"100"});root.textContent="Moonlight image probe (closes automatically)";document.body.appendChild(root);
 var nodes=[];
 for(var i=0;i<2;i++){
  var image=document.createElement("img");nodes.push(image);Object.assign(image.style,{width:"100px",height:"100px",display:i?"none":"block"});root.appendChild(image);
  (function(img,index){["load","error"].forEach(function(event){img.addEventListener(event,function(){log("MOONLIGHT_IMAGE_PROBE_EVENT: "+index+" "+event);});});})(image,i);
  image.src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGMwmPCfJMQwqmFUw/DVAADUFb8QyWXQHwAAAABJRU5ErkJggg==";
 }
 function state(){return nodes.map(function(image){return {width:image.width,height:image.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,complete:image.complete,display:image.style.display};});}
 await new Promise(function(done){setTimeout(done,1500);});await log("MOONLIGHT_IMAGE_PROBE_INITIAL: "+JSON.stringify(state()));
 nodes[1].style.display="block";
 await new Promise(function(done){setTimeout(done,1500);});await log("MOONLIGHT_IMAGE_PROBE_VISIBLE: "+JSON.stringify(state()));
 root.parentNode.removeChild(root);
})();
