const fs=require('node:fs');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');

function chromeArgs(profile,{platform=process.platform,env=process.env}={}){
 const args=['--headless','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+profile];
 if(platform==='linux'){
  args.push('--disable-dev-shm-usage');
  // Explicit opt-in for the disposable CI runner running our local fixtures.
  // Keep the normal browser sandbox enabled on developer machines.
  if(env.CHROME_NO_SANDBOX==='1')args.push('--no-sandbox');
 }
 return [...args,'about:blank'];
}

async function waitForChromePort(chrome,profile,{timeoutMs=30000,pollMs=50}={}){
 let spawnError,stderr='';
 const onError=error=>{spawnError=error;};
 const onData=data=>{stderr=(stderr+data).slice(-8000);};
 chrome.on('error',onError);chrome.stderr.on('data',onData);
 const failure=reason=>Error('Chrome startup failed: '+reason+'\n'+(stderr.trim()||'(no browser stderr)'));
 const deadline=Date.now()+timeoutMs;
 try{
  for(;;){
   if(spawnError)throw failure(spawnError.message);
   if(chrome.signalCode)throw failure('terminated by '+chrome.signalCode);
   if(chrome.exitCode!==null)throw failure('exited with code '+chrome.exitCode);
   let port;
   try{
    const match=/^(\d+)\r?\n/.exec(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8'));
    if(match)port=Number(match[1]);
   }
   catch(error){if(error.code!=='ENOENT')throw error;}
   // Wait for the complete first line; a partial numeric port is also valid
   // numerically, but would connect the tests to the wrong endpoint.
   if(Number.isInteger(port)&&port>0&&port<=65535)return port;
   if(Date.now()>=deadline)throw failure('timed out after '+timeoutMs+' ms waiting for DevToolsActivePort');
   await pause(Math.min(pollMs,Math.max(1,deadline-Date.now())));
  }
 }finally{
  chrome.removeListener('error',onError);chrome.stderr.removeListener('data',onData);
 }
}

module.exports={chromeArgs,waitForChromePort};
