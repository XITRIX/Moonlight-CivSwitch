#!/usr/bin/env python3
"""Bounded, resumable SDK deployment evidence; never replaces the boot trigger."""
import argparse, base64, hashlib, json
from pathlib import Path
import test_switch_roundtrip as t
from payload_menu import rpc, fnv_hash, component_bundle, system_package
from package_payload import read_package, wire_json
from install_streamed import install_package as install_streamed, plan as streamed_plan

ROOT=Path(__file__).resolve().parents[1]
CIV=ROOT.parent/'NS2-CivHomebrew'
DOOM=ROOT.parent/'NS2-Doom'
NES=ROOT.parent/'SW2NES'
OUT=ROOT/('build/sdk-performance-'+json.loads((ROOT/'civapps-native-ui.lock.json').read_text())['version'])
OUT.mkdir(parents=True,exist_ok=True)
HOST=None
# Cold activation stopped the resident after drawing Launcher. Do not stage the
# same failed pair again merely because its browser tests passed.
REJECTED_COMPONENT_CHECKSUMS={'9c1bd5fa','d7489522'}

def report(body,label='SDK_REPORT'):
    return t.report(HOST,body,label,OUT/(label+'.txt'))

def component_images():
    images={name:json.loads(path.read_text()) for name,path in {
        'core':CIV/'dist/core.civupdate','launcher':CIV/'dist/launcher-nanovg-main.civupdate'}.items()}
    if images['core']['source']!=component_bundle('core'):raise RuntimeError('Core package is stale; rebuild it before staging')
    for name,image in images.items():
        if image!=system_package(name,image['source'],image['release']):raise RuntimeError('Invalid component package: '+name)
        if image['checksum'] in REJECTED_COMPONENT_CHECKSUMS:raise RuntimeError('Component '+image['release']+' failed cold activation and is quarantined; use a corrected build')
    return images

def stage():
    images=component_images()
    report('delete window.__sdkBackupSource;return {cleared:true};','SDK_CACHE_CLEAR')
    for name,image in images.items():
        (OUT/(name+'.civupdate')).write_bytes(wire_json(image)+b'\n')
        current=report('return await __civhomebrewBoot.system.status('+json.dumps(name)+');','SDK_COMPONENT_STATUS')
        if current['pending'] is None and current['hashes'][current['active']]==image['checksum']:
            print('Already active: '+name+' '+image['release'],flush=True)
            continue
        old=current['hashes'][current['active']]
        source='(async function(){var b=__civhomebrewBoot,s=await b.system.status('+json.dumps(name)+');if(s.pending!==null||s.hashes[s.active]!=='+json.dumps(old)+')throw Error("Component changed since staging preflight");var image='+json.dumps(image,ensure_ascii=True,separators=(',',':'))+';await b.system.stage(image);await log("SDK_STAGED '+name+' '+image['checksum']+'");})();'
        t.finite(HOST,source,OUT/('stage-'+name+'.txt'))
        check=report('var s=await __civhomebrewBoot.system.status('+json.dumps(name)+'),v=await __civhomebrewBoot.native.io.read(PayloadCore.path("system/'+name+'/slot-"+s.pending+".js"),8388608,false);return {state:s,checksum:PayloadCore.hash(v),bytes:PayloadCore.encode(v).length};','SDK_STAGE_READBACK')
        if check['checksum']!=image['checksum'] or check['bytes']!=len(image['source'].encode()) or check['state']['attempted'] or check['state']['hashes'][check['state']['active']]!=old:raise RuntimeError('Staging readback mismatch')
        print('Staged '+name+': '+image['release']+' '+image['checksum'],flush=True)
    (OUT/'prepared.json').write_text(json.dumps({k:{'release':v['release'],'checksum':v['checksum'],'sha256':hashlib.sha256(v['source'].encode()).hexdigest()}for k,v in images.items()},indent=2))
    # Do not mount a pending native Launcher in the old renderer process.

def verify():
    expected=json.loads((OUT/'prepared.json').read_text())
    body='''var b=__civhomebrewBoot,components={};for(var name of ['core','launcher']){var s=await b.system.status(name),v=await b.native.io.read(PayloadCore.path('system/'+name+'/slot-'+s.active+'.js'),8388608,false);components[name]={state:s,checksum:PayloadCore.hash(v)};}var ui=CivHomebrewSDK.nativeUI.sessions.current;return {components:components,sdk:CivHomebrewSDK.version,ordered:typeof b.evaluateScripts,launcher:__civNanoVGMainLauncher.identity,native:{state:ui.renderer.owner.state,device:String(ui.renderer.owner.display.device),swapchain:String(ui.renderer.owner.display.swapchain),errors:ui.stats.errors}};'''
    activated=report(body,'SDK_COLD_VERIFY')
    for name,item in activated['components'].items():
        if item['state']['pending'] is not None or item['checksum']!=expected[name]['checksum']:raise RuntimeError('SDK component not activated: '+name)
    if activated['sdk']!=json.loads((ROOT/'civapps-native-ui.lock.json').read_text())['version'] or activated['native']['state']!='ready' or activated['native']['errors']:raise RuntimeError('SDK native owner not ready')
    (OUT/'activated.json').write_text(json.dumps(activated,indent=2))
    print('Cold activation verified: SDK '+activated['sdk'],flush=True)

def install():
    verify()
    install_packages()
    rpc(HOST,9027,{'op':'launcher'})

def prepare():
    """Install apps and stage components without backups or live owner replacement."""
    component_images()
    before=report('return {core:await __civhomebrewBoot.system.status("core"),launcher:await __civhomebrewBoot.system.status("launcher")};','SDK_PREPARE_PREFLIGHT')
    if any(s['pending'] is not None for s in before.values()):raise RuntimeError('A component update is already pending; inspect it before installing')
    install_packages()
    stage()
    print('All apps installed and verified; core/Launcher staged. Fully restart Civ VII, then open Load Game. No backups created.',flush=True)

def install_packages():
    packages=[(CIV/'dist/hello.civapp',CIV/'examples/hello'),
              (ROOT/'dist/moonlight.civapp',ROOT),(DOOM/'dist/Doom.civapp',DOOM),
              (CIV/'dist/civswitch-kit-checks.civapp',CIV/'examples/civswitch-kit'),
              (NES/'dist/sw2nes.civapp',NES)]
    # Validate every current source before changing the first installed app.
    for path,directory in packages:
        package=read_package(path)
        manifest=json.loads((directory/'payload.json').read_text())
        if [s['name'] for s in package['scripts']]!=manifest['scripts']:
            raise RuntimeError('Package script order differs from manifest: '+str(path))
        for script in package['scripts']:
            if script['source']!=(directory/script['name']).read_text():
                raise RuntimeError('Package source is stale: '+str(path)+' '+script['name'])
    before=rpc(HOST,9027,{'op':'list'})['entries']
    receipts=[]
    for path,directory in packages:
        package=read_package(path);t.idle(HOST)
        expected_entry=streamed_plan(package)['entry']
        existing=next((e for e in rpc(HOST,9027,{'op':'list'})['entries'] if e['id']==package['id']),None)
        if existing==expected_entry:
            response={'entry':existing}
        elif path.stat().st_size>8*1024*1024:
            response=install_streamed(HOST,package,OUT/(package['id']+'-stream'))
        else:
            response=rpc(HOST,9027,{'op':'install','package':package})
        body='''var io=__civhomebrewBoot.native.io,store=PayloadCore.createStore(io);await store.load();var m=await store.manifest(ID),files=[];for(var d of m.scripts){var source=await io.read(PayloadCore.appPath(m.id,d.path),d.bytes,false);if(source===null)throw Error('Missing installed source');var checksum=PayloadCore.hash(source),bytes=PayloadCore.encode(source).length;if(checksum!==d.checksum||bytes!==d.bytes)throw Error('Installed source readback mismatch: '+d.name);files.push({name:d.name,bytes:bytes,checksum:checksum});source=null;}var icon=null;if(m.icon){var raw=await io.read(PayloadCore.appPath(m.id,m.icon.path),m.icon.bytes,true);if(raw===null||raw.length!==m.icon.bytes||PayloadCore.hash(raw)!==m.icon.checksum)throw Error('Icon readback mismatch');icon={bytes:raw.length,checksum:PayloadCore.hash(raw)};raw=null;}return {metadata:m.metadata,scripts:files,icon:icon};'''.replace('ID',json.dumps(package['id']))
        actual=report(body,'SDK_INSTALL_READBACK')
        wanted=[{'name':s['name'],'bytes':len(s['source'].encode()),'checksum':fnv_hash(s['source'])}for s in package['scripts']]
        if actual['scripts']!=wanted or actual['metadata']!=package['metadata']:raise RuntimeError('Installed source/metadata differs: '+package['id'])
        raw_icon=base64.b64decode(package['icon'].split(',',1)[1]) if package.get('icon') else None
        wanted_icon={'bytes':len(raw_icon),'checksum':fnv_hash(raw_icon.decode('latin1'))} if raw_icon else None
        if actual['icon']!=wanted_icon:raise RuntimeError('Installed icon differs: '+package['id'])
        receipts.append({'id':package['id'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'entry':response['entry'],'verifiedScripts':len(wanted),'sources':wanted,'icon':wanted_icon})
        (OUT/'installed.json').write_text(json.dumps(receipts,indent=2))
        print('Installed; every script and icon readback verified: '+package['id']+' ('+str(len(wanted))+' scripts)',flush=True)
    other=lambda entries:[e for e in entries if e['id'] not in [r['id']for r in receipts]]
    if other(before)!=other(rpc(HOST,9027,{'op':'list'})['entries']):raise RuntimeError('Unrelated app catalog changed')

def apps():
    install_packages()
    rpc(HOST,9027,{'op':'launcher'})

TESTS={'hello':('sdk-hello-roundtrip.js','__civNanoVGHelloLauncherStart'),
       'doom':('sdk-doom-roundtrip.js','__sdkDoomTest'),
       'moonlight':('sdk-moonlight-roundtrip.js','__moonlightRoundtrip')}

def arm(name,sunshine=None):
    filename,key=TESTS[name]
    source=(ROOT/'investigation/probes'/filename).read_text()
    if name=='moonlight':
        if not sunshine:raise ValueError('Set --sunshine to the reachable paired Sunshine IPv4 address')
        source='window.__sdkTestSunshineAddress='+json.dumps(sunshine)+';\n'+source
    t.finite(HOST,source,OUT/(name+'-activation.txt'))
    print('Armed '+name+'; wait for normal return before sending another raw payload.',flush=True)

def extract(name):
    filename,key=TESTS[name]
    body='var r=window['+json.dumps(key)+'];if(!r||!r.finished)throw Error("Test has not finished");return JSON.parse(JSON.stringify(r,function(k,v){if(k==="done"||typeof v==="function")return undefined;return typeof v==="bigint"?v.toString():v;}));'
    try:
        result=report(body,'SDK_'+name.upper()+'_RESULT')
        (OUT/(name+'-result.json')).write_text(json.dumps(result,indent=2))
        print(json.dumps(result,indent=2),flush=True)
    finally:rpc(HOST,9027,{'op':'launcher'})
    if not result.get('complete') or result.get('error'):raise RuntimeError(name+' roundtrip failed; inspect saved evidence')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['prepare','stage','verify','install','apps','arm','extract']);p.add_argument('app',nargs='?',choices=TESTS);p.add_argument('--host',required=True,help='Switch address');p.add_argument('--sunshine',help='Reachable paired Sunshine IPv4 address for arm moonlight');a=p.parse_args();HOST=a.host
    if a.command in ['arm','extract']:
        if not a.app:p.error('Select an app')
        if a.command=='arm' and a.app=='moonlight' and not a.sunshine:p.error('arm moonlight requires --sunshine')
        if a.command=='arm':arm(a.app,a.sunshine)
        else:extract(a.app)
    else:globals()[a.command]()
