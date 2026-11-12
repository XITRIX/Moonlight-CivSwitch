#!/usr/bin/env python3
"""Install Moonlight only, then run/extract a bounded streaming performance test.

Uses the current resident and native owner. No component staging, save backup,
pairing/settings writes, or live diagnostic logging during streaming.
"""
import argparse
import hashlib
import json
from pathlib import Path

import test_switch_roundtrip as device
from payload_menu import fnv_hash
from package_payload import read_package

ROOT = Path(__file__).resolve().parents[1]


def report(host, body, label, directory):
    directory.mkdir(parents=True, exist_ok=True)
    return device.report(host, body, label, directory / (label + '.txt'))


def fresh_package():
    path = ROOT / 'dist/moonlight.civapp'
    package = read_package(path)
    if [s['name'] for s in package['scripts']] != json.loads((ROOT / 'payload.json').read_text())['scripts']:
        raise RuntimeError('Package script order is stale; rebuild and inspect it')
    for script in package['scripts']:
        if script['source'] != (ROOT / script['name']).read_text():
            raise RuntimeError('Stale packaged source: ' + script['name'])
    return package, hashlib.sha256(path.read_bytes()).hexdigest()


def install(args):
    package, digest = fresh_package()
    device.idle(args.host)
    before = device.rpc(args.host, 9027, {'op': 'list'})['entries']
    preflight = report(args.host, """var s=CivNanoVGSession.current;
if(!s||s.renderer.owner.state!=='ready'||s.stats.errors.length)throw Error('Native owner unavailable');
return {sdk:CivAppsNativeUI.version,coreSdk:CivHomebrewSDK.version,device:String(s.renderer.owner.display.device),swapchain:String(s.renderer.owner.display.swapchain),core:await __civhomebrewBoot.system.status('core'),launcher:await __civhomebrewBoot.system.status('launcher')};""", 'MOONLIGHT_PERF_PREFLIGHT', args.output)
    if preflight['sdk'] != json.loads((ROOT / 'civapps-native-ui.lock.json').read_text())['version']:
        raise RuntimeError('Active SDK differs from the packaged dependency')
    installed = device.rpc(args.host, 9027, {'op': 'install', 'package': package})
    actual = report(args.host, """var io=__civhomebrewBoot.native.io,store=PayloadCore.createStore(io);await store.load();var m=await store.manifest('moonlight-civswitch'),scripts=[];
for(var d of m.scripts){var source=await io.read(PayloadCore.appPath(m.id,d.path),d.bytes,false);if(source===null)throw Error('Missing script');scripts.push({name:d.name,bytes:PayloadCore.encode(source).length,checksum:PayloadCore.hash(source)});source=null;}
var icon=await io.read(PayloadCore.appPath(m.id,m.icon.path),m.icon.bytes,true);
return {metadata:m.metadata,scripts:scripts,icon:{bytes:icon.length,checksum:PayloadCore.hash(icon)},core:await __civhomebrewBoot.system.status('core'),launcher:await __civhomebrewBoot.system.status('launcher')};""", 'MOONLIGHT_PERF_READBACK', args.output)
    expected = [{'name': s['name'], 'bytes': len(s['source'].encode()), 'checksum': fnv_hash(s['source'])} for s in package['scripts']]
    import base64
    icon = base64.b64decode(package['icon'].split(',', 1)[1])
    if actual['scripts'] != expected or actual['metadata'] != package['metadata'] or actual['icon'] != {'bytes': len(icon), 'checksum': fnv_hash(icon.decode('latin1'))}:
        raise RuntimeError('Installed package readback mismatch')
    if any(actual[k] != preflight[k] for k in ('core', 'launcher')):
        raise RuntimeError('System component state changed')
    others = lambda entries: [e for e in entries if e['id'] != package['id']]
    if others(before) != others(device.rpc(args.host, 9027, {'op': 'list'})['entries']):
        raise RuntimeError('Unrelated app catalog changed')
    receipt = dict(host=args.host, packageSha256=digest, entry=installed['entry'], verifiedScripts=len(expected), preflight=preflight, otherAppsUnchanged=True)
    (args.output / 'installed.json').write_text(json.dumps(receipt, indent=2))
    device.rpc(args.host, 9027, {'op': 'launcher'})
    print(json.dumps(receipt, indent=2), flush=True)


def arm(args):
    _, digest = fresh_package()
    receipt = json.loads((args.output / 'installed.json').read_text())
    if receipt['host'] != args.host or receipt['packageSha256'] != digest:
        raise RuntimeError('Install receipt does not match the current host/package')
    width, height = {'1080p': (1920, 1080), '1440p': (2560, 1440), '4k': (3840, 2160)}[args.resolution]
    config = dict(codec=args.codec, width=width, height=height, bitrate=args.bitrate, fps=args.fps, pacing=args.pacing, durationMs=args.duration * 1000, warmupMs=5000, showStats=args.show_stats, simulateTouch=args.simulate_touch, terminateDesktop=args.terminate_desktop)
    config.update(profile=args.profile, touchPattern=args.touch_pattern, recordTouch=args.record_touch)
    if args.sunshine:
        config['sunshine'] = args.sunshine
    if args.app_id:
        config['appId'] = args.app_id
    source = 'window.__moonlightPerformanceConfig=' + json.dumps(config) + ';\n' + (ROOT / 'investigation/probes/moonlight-performance.js').read_text()
    (args.output / 'probe.js').write_text(source)
    (args.output / 'test.json').write_text(json.dumps(dict(config=config, packageSha256=digest, probeSha256=hashlib.sha256(source.encode()).hexdigest()), indent=2) + '\n')
    device.finite(args.host, source, args.output / 'activation.txt')
    print('Armed installed-app performance test. Allow launch, 5 s warmup, measurement and cleanup before extraction. Do not send another raw payload while it runs.', flush=True)


def extract(args):
    body = """var r=window.__moonlightPerformance;if(!r||!r.finished)throw Error('Performance test has not finished');
var result=Object.assign({},r,{timeline:(r.samples||[]).map(function(sample){var s=sample.stats;return {time:sample.time,phase:sample.phase,physicalTouchSamples:sample.physicalTouchSamples,epoch:sample.epoch,bitrate:s.mode&&s.mode.bitrate,adaptation:s.bitrateAdaptation,presented:s.presented,decoded:s.decoded,pumpMs:s.pumpMs,drainMs:s.drainMs,iterations:s.iterations,network:s.network,input:s.input,fec:s.fec};})});
return JSON.parse(JSON.stringify(result,function(k,v){if(k==='done'||typeof v==='function'||COMPACT&&(k==='samples'||k==='intervals'))return undefined;return typeof v==='bigint'?v.toString():v;}));""".replace('COMPACT', 'true' if args.compact else 'false')
    result = report(args.host, body, 'MOONLIGHT_PERF_RESULT', args.output)
    (args.output / 'result.json').write_text(json.dumps(result, indent=2))
    device.rpc(args.host, 9027, {'op': 'launcher'})
    print(json.dumps({k: result.get(k) for k in ('complete', 'error', 'host', 'app', 'config', 'summary', 'refreshDuring', 'refreshAfter', 'finalIdentity', 'finalResident')}, indent=2), flush=True)
    if not result['complete'] or result['error']:
        raise RuntimeError('Console performance test failed; inspect saved evidence')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['status', 'install', 'arm', 'extract'])
    parser.add_argument('--host', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'build/moonlight-performance-50mbps')
    parser.add_argument('--sunshine', help='Optional route to the already paired PC, e.g. IPv4:47989')
    parser.add_argument('--app-id', type=int, help='Select a specific available Sunshine application')
    parser.add_argument('--codec', choices=['h264', 'av1'], default='h264')
    parser.add_argument('--fps', type=int, choices=[60, 120], default=60)
    parser.add_argument('--resolution', choices=['1080p', '1440p', '4k'], default='1080p')
    parser.add_argument('--bitrate', type=lambda value: 'auto' if value == 'auto' else int(value), choices=['auto',1000,2000,3000,5000,8000,10000,15000,20000,25000,30000,40000,50000,60000,70000,80000], default=50000, help='Requested kbit/s (default 50000)')
    parser.add_argument('--pacing', choices=['smooth', 'latency'], default='smooth')
    parser.add_argument('--duration', type=int, default=60)
    parser.add_argument('--show-stats', action='store_true')
    parser.add_argument('--terminate-desktop', action='store_true', help='Terminate only Desktop/Virtual Display, then stress library navigation')
    parser.add_argument('--simulate-touch', action='store_true', help='Add a moving native trackpad contact during measurement; never clicks')
    parser.add_argument('--record-touch', action='store_true', help='Record physical touch activity without stage timing overhead')
    parser.add_argument('--profile', action='store_true', help='Collect bounded stage timings in RAM')
    parser.add_argument('--compact', action='store_true', help='Extract summaries/profiles without per-frame intervals or all stats samples')
    parser.add_argument('--touch-pattern', choices=['continuous', 'alternating'], default='continuous', help='Alternating gates remote mouse forwarding off/on/off while HID remains active')
    args = parser.parse_args()
    if not 10 <= args.duration <= 900:
        parser.error('--duration must be 10–900 seconds')
    if args.resolution != '1080p' and args.codec != 'av1':
        parser.error('1440p/4K requires --codec av1')
    if args.resolution == '4k' and args.fps > 60:
        parser.error('4K is limited to 60 FPS')
    if args.touch_pattern == 'alternating' and not args.simulate_touch:
        parser.error('--touch-pattern alternating requires --simulate-touch')
    args.output.mkdir(parents=True, exist_ok=True)
    if args.app_id is not None and not 1 <= args.app_id <= 0xffffffff:
        parser.error('--app-id must be a positive uint32')
    if args.command == 'status':
        print(json.dumps(device.rpc(args.host, 9027, {'op': 'status'}), indent=2))
    else:
        globals()[args.command](args)
