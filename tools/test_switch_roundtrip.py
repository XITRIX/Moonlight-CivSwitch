#!/usr/bin/env python3
"""Install/verify the native Moonlight roundtrip through existing resident APIs.
No trigger/core rewrite or renderer hot replacement. Stop on any failed transfer.
"""
import argparse,hashlib,importlib.util,json,sys
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CIV=ROOT.parent/'NS2-CivHomebrew'
sys.path.insert(0,str(CIV/'tools'));sys.path.insert(0,str(CIV/'tools/nanovg'))
from payload_menu import rpc,system_package
from package_payload import read_package,wire_json
from send_app import plan_upload,send_stage
spec=importlib.util.spec_from_file_location('native_installer',CIV/'tools/nanovg/install-main.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
EVIDENCE=ROOT/'investigation/evidence'

def report(host,body,label,path):
    idle(host)
    return installer.read_report(host,body,label,path)

def finite(host,source,path):
    idle(host)
    stages,last=plan_upload(source.encode())
    with path.open('wb')as output:
        for stage in stages:send_stage(host,9026,stage,output,timeout=30)
        send_stage(host,9026,last,output,timeout=60)

def idle(host):
    state=rpc(host,9027,{'op':'status'})['state']
    if state.get('busy')or state.get('mode')not in ['launcher','terminal']:raise RuntimeError('Close the foreground app and wait for the resident to become idle')
    return state

def stage_source(image,old_hash):
    prefix="(async function(){var b=window.__civhomebrewBoot,s=await b.system.status('launcher');if(s.pending!==null||s.hashes[s.active]!=="+json.dumps(old_hash)+")throw Error('Launcher changed after backup');var input="
    suffix=";var result=await b.system.stage(input);s=await b.system.status('launcher');if(s.hashes[s.pending]!==input.checksum||s.attempted||s.hashes[s.active]!=="+json.dumps(old_hash)+")throw Error('Staged launcher state mismatch');await log('MOONLIGHT_LAUNCHER_STAGED '+JSON.stringify({release:result.release,active:s.active,pending:s.pending,checksum:s.hashes[s.pending]}));})();"
    return prefix+json.dumps(image,ensure_ascii=True,separators=(',',':'))+suffix

def prepare(host):
    idle(host)
    package=read_package(ROOT/'dist/moonlight.civapp')
    image=json.loads((CIV/'dist/launcher-nanovg-main.civupdate').read_text())
    manifest=json.loads((CIV/'build/nanovg/main-manifest.json').read_text())
    metadata=json.loads((EVIDENCE/'moonlight-roundtrip-install-metadata.json').read_text())
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup=ROOT/'build/device-backups'/stamp;backup.mkdir(parents=True,exist_ok=False)
    # Reuse the exact PC backup from the previously verified installation.
    # Never aggregate executable sources into one device-side JSON/base64 object.
    previous=json.loads((CIV/'dist/launcher-nanovg-main-installed.civupdate').read_text())
    from payload_menu import fnv_hash
    if previous['checksum']!=metadata['launcherMetadata']['checksum']or fnv_hash(previous['source'])!=previous['checksum']:raise RuntimeError('Previous verified Launcher backup does not match current metadata')
    (backup/'launcher.civupdate').write_bytes(wire_json(previous)+b'\n')
    old=metadata['appManifest'];scripts=[]
    for i,script in enumerate(old['scripts']):
        path='save:/civhomebrew/apps/moonlight-civswitch/'+script['path']
        body="var b=window.__civhomebrewBoot,shared=window.CivNanoVGSession&&CivNanoVGSession.current;if(shared&&shared.active)await shared.active.lease.close();await log('MOONLIGHT_BACKUP_FILE "+str(i)+"');var source=await b.native.io.read("+json.dumps(path)+","+str(script['bytes'])+",false);if(source===null||PayloadCore.hash(source)!=="+json.dumps(script['checksum'])+")throw Error('Backup script checksum mismatch');return {source:source};"
        value=report(host,body,'MOONLIGHT_BACKUP_FILE_DATA',backup/('script-'+str(i)+'.txt'))
        if len(value['source'].encode())!=script['bytes']:raise RuntimeError('Backup script byte mismatch')
        scripts.append({'name':script['name'],'source':value['source']})
        print('Backed up '+str(i+1)+'/'+str(len(old['scripts']))+': '+script['name'],flush=True)
    icon=report(host,"var raw=await window.__civhomebrewBoot.native.io.read(PayloadCore.appPath('moonlight-civswitch','icon.png'),524288,true);return {icon:raw?'data:image/png;base64,'+PayloadCore.base64(raw):''};",'MOONLIGHT_BACKUP_ICON',backup/'icon-transfer.txt')['icon']
    previous_app={'format':'civswitch-app','version':1,'id':old['id'],'name':old['name'],'metadata':old['metadata'],'scripts':scripts,'icon':icon}
    (backup/'moonlight.civapp').write_bytes(wire_json(previous_app)+b'\n');read_package(backup/'moonlight.civapp')
    (backup/'state.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print('Verified Launcher and Moonlight backups: '+str(backup),flush=True)
    catalog=rpc(host,9027,{'op':'list'})['entries']
    installed=rpc(host,9027,{'op':'install','package':package})
    print('Moonlight installation acknowledged: '+installed['entry']['id'],flush=True)
    finite(host,stage_source(image,previous['checksum']),backup/'stage-transfer.txt')
    # Return only hashes/lengths. Native readback is bounded to one source at a time.
    body="""var b=window.__civhomebrewBoot,s=await b.system.status('launcher');if(s.pending===null||s.attempted)throw Error('No unattempted launcher update');var source=await b.native.io.read(PayloadCore.path('system/launcher/slot-'+s.pending+'.js'),8*1024*1024,false),launcher={checksum:PayloadCore.hash(source),bytes:PayloadCore.encode(source).length};source=null;var text=await b.native.io.read(PayloadCore.appPath('moonlight-civswitch','manifest.json'),65536,false),m=JSON.parse(text),scripts=[];for(var item of m.scripts){var value=await b.native.io.read(PayloadCore.appPath(m.id,item.path),item.bytes,false);scripts.push({name:item.name,checksum:PayloadCore.hash(value),bytes:PayloadCore.encode(value).length});value=null;}return {state:s,core:await b.system.status('core'),launcher:launcher,metadata:m.metadata,scripts:scripts};"""
    after=report(host,body,'MOONLIGHT_DEPLOY_VERIFY',backup/'verify-transfer.txt')
    if after['launcher']!={'checksum':image['checksum'],'bytes':len(image['source'].encode())}:raise RuntimeError('Installed Launcher source differs from fresh package')
    if after['core']!=metadata['core']:raise RuntimeError('Core state changed unexpectedly')
    if after['metadata']!=package['metadata']:raise RuntimeError('Moonlight metadata differs')
    expected=[{'name':item['name'],'checksum':fnv_hash(item['source']),'bytes':len(item['source'].encode())}for item in package['scripts']]
    if after['scripts']!=expected:raise RuntimeError('Installed Moonlight script readback differs')
    other=lambda rows:sorted((e['id'],e['checksum'],e['bytes'])for e in rows if e['id']!='moonlight-civswitch')
    if other(rpc(host,9027,{'op':'list'})['entries'])!=other(catalog):raise RuntimeError('Another app changed')
    receipt={'host':host,'time':stamp,'backup':str(backup),'launcher':{'release':image['release'],'checksum':image['checksum'],'identity':manifest['identity'],'sourceSha256':hashlib.sha256(image['source'].encode()).hexdigest(),'state':after['state'],'activation':'pending fresh Civ VII process'},'moonlight':{'id':package['id'],'scripts':len(package['scripts']),'packageSha256':hashlib.sha256((ROOT/'dist/moonlight.civapp').read_bytes()).hexdigest(),'verifiedSources':expected},'coreUnchanged':True,'otherAppsUnchanged':True}
    (EVIDENCE/'moonlight-native-roundtrip-install.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print('Moonlight source readback verified; Launcher staged and source readback verified. Restart Civ VII before opening Launcher.',flush=True)
    print(json.dumps({'launcher':receipt['launcher'],'moonlightScripts':len(package['scripts']),'coreUnchanged':True,'otherAppsUnchanged':True},indent=2),flush=True)

def verify(host):
    idle(host)
    receipt=json.loads((EVIDENCE/'moonlight-native-roundtrip-install.json').read_text())
    body="""var b=window.__civhomebrewBoot,s=await b.system.status('launcher'),component=window.__civNanoVGMainLauncher,shared=window.CivNanoVGSession&&CivNanoVGSession.current;if(!component||!shared)throw Error('Native Launcher is not active');var source=await b.native.io.read(PayloadCore.path('system/launcher/slot-'+s.active+'.js'),8*1024*1024,false);return {state:s,core:await b.system.status('core'),sourceChecksum:PayloadCore.hash(source),sourceBytes:PayloadCore.encode(source).length,identity:component.identity,release:component.release,mounts:component.mounts,native:{api:shared.api,surfaceApi:typeof shared.renderer.bindSurface,errors:shared.stats.errors,state:shared.renderer.owner.state,device:String(shared.renderer.owner.display.device),swapchain:String(shared.renderer.owner.display.swapchain)},orderedEvaluator:typeof b.evaluateScripts};"""
    result=report(host,body,'MOONLIGHT_COLD_VERIFY',EVIDENCE/'moonlight-native-roundtrip-cold-verify.txt')
    expected=receipt['launcher']
    if result['state']['pending']is not None or result['state']['hashes'][result['state']['active']]!=expected['checksum']:raise RuntimeError('Launcher update is not acknowledged')
    if result['sourceChecksum']!=expected['checksum']or result['identity']!=expected['identity']:raise RuntimeError('Active Launcher source/identity differs')
    if result['native']['api']!=1 or result['native']['surfaceApi']!='function'or result['native']['state']!='ready'or result['native']['errors']:raise RuntimeError('Shared renderer is not ready')
    if result['orderedEvaluator']!='function':raise RuntimeError('Installed bootstrap lacks ordered-script evaluation')
    (EVIDENCE/'moonlight-native-roundtrip-cold-verify.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2),flush=True)

def arm(host):
    idle(host)
    receipt=json.loads((EVIDENCE/'moonlight-native-roundtrip-install.json').read_text())
    if hashlib.sha256((ROOT/'dist/moonlight.civapp').read_bytes()).hexdigest()!=receipt['moonlight']['packageSha256']:raise RuntimeError('Fresh Moonlight package differs from the installed receipt')
    finite(host,(ROOT/'investigation/probes/moonlight-native-roundtrip.js').read_text(),EVIDENCE/'moonlight-native-roundtrip-activation.txt')
    print('Bounded real-app roundtrip started. Do not send another raw payload until the app finishes.',flush=True)

def extract(host):
    idle(host)
    body="""var r=window.__moonlightRoundtrip;if(!r||!r.finished)throw Error('No finished roundtrip result');return JSON.parse(JSON.stringify(r,function(k,v){if(k==='done'||typeof v==='function')return undefined;return typeof v==='bigint'?v.toString():v;}));"""
    result=report(host,body,'MOONLIGHT_ROUNDTRIP_RESULT',EVIDENCE/'moonlight-native-roundtrip-results.txt')
    (EVIDENCE/'moonlight-native-roundtrip-results.json').write_text(json.dumps(result,indent=2)+'\n')
    rpc(host,9027,{'op':'launcher'})
    import time
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        state=rpc(host,9027,{'op':'status'})['state']
        if state['mode']=='launcher'and not state['busy']:break
        time.sleep(.25)
    else:raise RuntimeError('Launcher did not remount after result extraction')
    print(json.dumps({'result':result,'finalResident':state},indent=2),flush=True)

def apply_layout(host):
    # Historical scene-only migration was qualified for launcher .3 -> .4.
    # The extracted library is a different owner build and requires restart.
    raise RuntimeError('The scene-only migration is retired. Install the matching versioned Launcher and Moonlight packages, then restart Civ VII.')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['prepare','verify','arm','extract','apply_layout']);parser.add_argument('host');args=parser.parse_args()
    globals()[args.command](args.host)
if __name__=='__main__':main()
