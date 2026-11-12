#!/usr/bin/env python3
"""Stage the qualified keyboard update with PC backups; verify after a cold boot.

Uses the existing resident installer and two-slot Launcher update APIs. Never
rewrites the boot trigger/core or replaces a live graphics owner. Leave Launcher
Options and close foreground apps before running either command.
"""
import argparse
import base64
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import test_switch_roundtrip as t
from payload_menu import fnv_hash, system_package
from package_payload import read_package, wire_json

ROOT = Path(__file__).resolve().parents[1]
CIV = ROOT.parent / 'NS2-CivHomebrew'
OUT = ROOT / 'build/native-keyboard'
RECEIPT = OUT / 'installed.json'


def report(host, body, label, directory=OUT):
    directory.mkdir(parents=True, exist_ok=True)
    return t.report(host, body, label, directory / (label + '.txt'))


def stage(host):
    t.idle(host)
    package = read_package(ROOT / 'dist/moonlight.civapp')
    manifest = json.loads((ROOT / 'payload.json').read_text())
    if [s['name'] for s in package['scripts']] != manifest['scripts']:
        raise RuntimeError('Rebuild Moonlight: package script order is stale')
    for script in package['scripts']:
        if script['source'] != (ROOT / script['name']).read_text():
            raise RuntimeError('Rebuild Moonlight: stale source ' + script['name'])
    image = json.loads((CIV / 'dist/launcher-nanovg-main.civupdate').read_text())
    dependencies = json.loads((CIV / 'build/nanovg/main-manifest.json').read_text())
    for name, digest in dependencies['dependencies'].items():
        if hashlib.sha256((CIV / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Rebuild Launcher: stale source ' + name)
    if system_package('launcher', image['source'], image['release']) != image:
        raise RuntimeError('Invalid Launcher package')
    before_catalog = t.rpc(host, 9027, {'op': 'list'})['entries']
    backup = OUT / ('backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    before = report(host, """var b=__civhomebrewBoot,s=await b.system.status('launcher');
if(s.pending!==null||s.attempted)throw Error('A Launcher update is already pending');
var source=await b.native.io.read(PayloadCore.path('system/launcher/slot-'+s.active+'.js'),8388608,false);
var meta=PayloadCore.open(await b.native.io.read(PayloadCore.path('system/launcher/slot-'+s.active+'.json'),65536,false));
if(source===null||PayloadCore.hash(source)!==s.hashes[s.active]||meta.checksum!==s.hashes[s.active])throw Error('Launcher backup mismatch');
var store=PayloadCore.createStore(b.native.io);await store.load();
return {launcher:s,launcherMetadata:meta,launcherSource:source,core:await b.system.status('core'),app:await store.manifest('moonlight-civswitch')};""", 'KEYBOARD_BACKUP_STATE', backup)
    old_image = system_package('launcher', before.pop('launcherSource'), before['launcherMetadata']['release'])
    (backup / 'launcher.civupdate').write_bytes(wire_json(old_image) + b'\n')
    old = before['app']
    scripts = []
    for index, item in enumerate(old['scripts']):
        body = 'var s=await __civhomebrewBoot.native.io.read(' + json.dumps('save:/civhomebrew/apps/' + old['id'] + '/' + item['path']) + ',' + str(item['bytes']) + ',false);return {source:s};'
        source = report(host, body, 'KEYBOARD_BACKUP_SCRIPT_' + str(index), backup)['source']
        if source is None or len(source.encode()) != item['bytes'] or fnv_hash(source) != item['checksum']:
            raise RuntimeError('Moonlight backup mismatch: ' + item['name'])
        scripts.append({'name': item['name'], 'source': source})
        print('Verified backup ' + str(index + 1) + '/' + str(len(old['scripts'])), flush=True)
    icon = ''
    if old.get('icon'):
        icon_bytes = report(host, "var r=await __civhomebrewBoot.native.io.read(PayloadCore.appPath('moonlight-civswitch','icon.png'),524288,true);return {data:PayloadCore.base64(r)};", 'KEYBOARD_BACKUP_ICON', backup)['data']
        raw = base64.b64decode(icon_bytes)
        if len(raw) != old['icon']['bytes'] or fnv_hash(raw.decode('latin1')) != old['icon']['checksum']:
            raise RuntimeError('Moonlight icon backup mismatch')
        icon = 'data:image/png;base64,' + icon_bytes
    previous = dict(format='civswitch-app', version=1, id=old['id'], name=old['name'], metadata=old['metadata'], scripts=scripts, icon=icon)
    (backup / 'moonlight.civapp').write_bytes(wire_json(previous) + b'\n')
    read_package(backup / 'moonlight.civapp')
    (backup / 'state.json').write_text(json.dumps(before, indent=2) + '\n')
    # Stage only. Mounting the pending component in this process would attempt
    # to replace an existing native owner. A full Civ VII restart activates it.
    t.finite(host, t.stage_source(image, old_image['checksum']), OUT / 'stage-launcher.txt')
    staged = report(host, "var b=__civhomebrewBoot,s=await b.system.status('launcher'),v=await b.native.io.read(PayloadCore.path('system/launcher/slot-'+s.pending+'.js'),8388608,false);return {state:s,checksum:PayloadCore.hash(v),core:await b.system.status('core')};", 'KEYBOARD_STAGE_READBACK')
    if staged['checksum'] != image['checksum'] or staged['state']['attempted'] or staged['core'] != before['core']:
        raise RuntimeError('Launcher staging readback mismatch')
    installed = t.rpc(host, 9027, {'op': 'install', 'package': package})
    actual = report(host, """var b=__civhomebrewBoot,store=PayloadCore.createStore(b.native.io);await store.load();
var m=await store.manifest('moonlight-civswitch'),scripts=[];
for(var d of m.scripts){var v=await b.native.io.read(PayloadCore.appPath(m.id,d.path),d.bytes,false);scripts.push({name:d.name,bytes:PayloadCore.encode(v).length,checksum:PayloadCore.hash(v)});v=null;}
return {metadata:m.metadata,scripts:scripts,core:await b.system.status('core')};""", 'KEYBOARD_INSTALL_READBACK')
    expected = [{'name': s['name'], 'bytes': len(s['source'].encode()), 'checksum': fnv_hash(s['source'])} for s in package['scripts']]
    if actual['scripts'] != expected or actual['metadata'] != package['metadata'] or actual['core'] != before['core']:
        raise RuntimeError('Moonlight installation readback mismatch')
    others = lambda rows: [e for e in rows if e['id'] != package['id']]
    if others(before_catalog) != others(t.rpc(host, 9027, {'op': 'list'})['entries']):
        raise RuntimeError('Unrelated app catalog changed')
    receipt = dict(host=host, backup=str(backup), launcher=dict(release=image['release'], checksum=image['checksum'], identity=dependencies['identity'], pending=staged['state']['pending']), moonlight=dict(entry=installed['entry'], scripts=expected, metadata=package['metadata'], packageSha256=hashlib.sha256((ROOT / 'dist/moonlight.civapp').read_bytes()).hexdigest()), core=before['core'], otherAppsUnchanged=True, activation='pending full Civ VII restart')
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')
    print('Installed Moonlight with every script verified; staged Launcher. Fully restart Civ VII before opening either app.', flush=True)


def verify(host):
    expected = json.loads(RECEIPT.read_text())
    actual = report(host, """var b=__civhomebrewBoot,s=await b.system.status('launcher'),v=await b.native.io.read(PayloadCore.path('system/launcher/slot-'+s.active+'.js'),8388608,false),ui=CivAppsNativeUI,session=ui.sessions.current;
return {state:s,checksum:PayloadCore.hash(v),identity:__civNanoVGMainLauncher.identity,sdk:ui.version,keyboard:!!(ui.keyboard&&ui.keyboard.api===1),native:session.renderer.owner.state,errors:session.stats.errors,core:await b.system.status('core')};""", 'KEYBOARD_COLD_VERIFY')
    if actual['state']['pending'] is not None or actual['checksum'] != expected['launcher']['checksum'] or actual['identity'] != expected['launcher']['identity']:
        raise RuntimeError('New Launcher was not cold-activated')
    if actual['sdk'] != '1.3.5' or not actual['keyboard'] or actual['native'] != 'ready' or actual['errors'] or actual['core'] != expected['core']:
        raise RuntimeError('Cold keyboard/native owner verification failed')
    (OUT / 'activated.json').write_text(json.dumps(actual, indent=2) + '\n')
    t.rpc(host, 9027, {'op': 'launcher'})
    print('Verified SDK 1.3.5 keyboard, acknowledged Launcher, healthy native owner and unchanged core; returned to Launcher.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['stage', 'verify'])
    parser.add_argument('--host', required=True)
    args = parser.parse_args()
    globals()[args.command](args.host)
