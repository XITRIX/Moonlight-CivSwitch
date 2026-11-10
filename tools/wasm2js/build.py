#!/usr/bin/env python3
"""Build the complete upstream C core as a self-contained wasm2js library."""
import json
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
from rtp_timestamp import specialize
from unaligned_loads import specialize as specialize_loads
from video_receive import specialize as specialize_video_receive, SOURCE_SHA256 as VIDEO_RECEIVE_SHA256
from video_queue import specialize as specialize_video_queue, fixture as video_queue_fixture, SOURCE_SHA256 as VIDEO_QUEUE_SHA256

here = Path(__file__).resolve().parent
root = here.parents[1]
sdk = root / 'toolchains/emsdk'
core = root / 'third_party/moonlight-common-c'
lock = json.loads((root / 'third_party/sources.lock.json').read_text())
build = root / 'build/wasm2js'
dist = root / 'dist/runtime'
build.mkdir(parents=True, exist_ok=True)
dist.mkdir(parents=True, exist_ok=True)
if not (sdk / '.emscripten').exists():
    raise SystemExit('Activate the local Emscripten 3.1.74 SDK first; see README.md')
for name, path in [('moonlight-common-c', core), ('mbedtls', root / 'third_party/mbedtls'), ('emsdk', sdk),
                   ('enet', core / 'enet'), ('nanors', core / 'nanors'),
                   ('mbedtls-framework', root / 'third_party/mbedtls/framework')]:
    actual = subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()
    expected = lock[name]['commit'] if isinstance(lock[name], dict) else lock[name]
    if actual != expected:
        raise SystemExit(f'Revision mismatch for {name}: {actual} != {expected}')
queue_source=(core/'src/RtpVideoQueue.c').read_text()
if hashlib.sha256(queue_source.encode()).hexdigest()!=VIDEO_QUEUE_SHA256:
    raise SystemExit('Pinned RtpVideoQueue.c content changed; review the source adaptation')
(build/'RtpVideoQueue.c').write_text(specialize_video_queue(queue_source))
(build/'video-queue-fixture.h').write_text(video_queue_fixture(queue_source))
(build/'VideoStream.c').write_text(specialize_video_receive((core/'src/VideoStream.c').read_text()))
env = os.environ.copy()
env['EM_CONFIG'] = str(sdk / '.emscripten')
env['EM_CACHE'] = str(build / 'emscripten-cache')
env['EMSDK'] = str(sdk)
env['PATH'] = str(sdk / 'upstream/emscripten') + os.pathsep + env.get('PATH', '')
version = subprocess.check_output([str(sdk / 'upstream/emscripten/emcc'), '--version'], env=env, text=True)
if not re.search(r'\b3\.1\.74\b', version.splitlines()[0]):
    raise SystemExit('The active local SDK is not Emscripten 3.1.74; run bootstrap.py')
header = (core / 'src/Limelight.h').read_text()
public = sorted(set(re.findall(r'^\w[^;{}]*?\b(Li\w+)\s*\(', header, re.M)))
exports = ['_malloc', '_free'] + ['_' + name for name in public] + [
    '_ml_test_rtsp', '_ml_test_fec', '_ml_test_crypto', '_ml_test_unaligned', '_ml_compare_runtime', '_ml_probe_threads', '_ml_random_probe']
(build / 'exports.json').write_text(json.dumps(exports))
stream_exports=[name for name in exports if name!='_ml_probe_threads']+[
    '_ml_video_batch_configure','_ml_video_batch_test_start','_ml_video_batch_test_result','_ml_session_set_reference_recovery','_ml_session_reference_recovery','_ml_session_set_rumble',
    '_ml_runtime_pump','_ml_runtime_tasks','_ml_runtime_budget_yields','_ml_budget_test_start','_ml_budget_test_result','_ml_session_start','_ml_session_stop',
    '_ml_session_state','_ml_session_error','_ml_session_video_frames','_ml_session_audio_frames',
    '_ml_scheduler_test_start','_ml_scheduler_test_result','_ml_input_priority_test_start','_ml_input_priority_test_result','_ml_input_wake_test_start','_ml_input_wake_test_result','_ml_interrupt_test_start','_ml_interrupt_test_result','_ml_network_test_start','_ml_network_test_result',
    '_ml_png_nv12','_ml_png_release','_ml_session_gamepad','_ml_session_key','_ml_session_metrics','_ml_fec_metrics','_ml_fec_prepare_pair','_ml_test_fec_vectors','_ml_test_fec_large','_ml_fec_budget_test_start','_ml_fec_budget_test_result','_ml_fec_kernel_benchmark','_ml_test_rtp_timestamp','_ml_packet_pool_configure','_ml_packet_pool_metrics','_ml_test_packet_pool','_ml_test_video_queue','_ml_video_queue_benchmark','_ml_packet_pool_benchmark']
(build / 'stream-exports.json').write_text(json.dumps(stream_exports))
subprocess.run([str(sdk / 'upstream/emscripten/emcmake'), 'cmake', '-S', str(here), '-B', str(build),
                '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5'], env=env, check=True)
subprocess.run(['cmake', '--build', str(build), '--parallel', '8'], env=env, check=True)
artifact = build / 'moonlight-core.js'
shutil.copy2(artifact, dist / artifact.name)
shutil.copy2(build / 'fiber-proof.js', dist / 'fiber-proof.js')
raw_stream=(build/'moonlight-stream.js').read_text()
stream_source,stream_sites=specialize(raw_stream,(build/'moonlight-stream.js.symbols').read_text())
stream_source,load_sites=specialize_loads(stream_source,(build/'moonlight-stream.js.symbols').read_text())
(dist/'moonlight-stream.js').write_text(stream_source)
licenses = dist / 'licenses'
licenses.mkdir(exist_ok=True)
for name, source in [('moonlight-common-c', core / 'LICENSE.txt'), ('enet', core / 'enet/LICENSE'),
                     ('nanors', core / 'nanors/LICENSE'), ('mbedtls', root / 'third_party/mbedtls/LICENSE'),
                     ('emscripten', sdk / 'upstream/emscripten/LICENSE')]:
    shutil.copy2(source, licenses / (name + '.txt'))
manifest = {'format': 'wasm2js', 'emscripten': '3.1.74', 'exports': exports,
            'stream':{'sha256':hashlib.sha256(stream_source.encode()).hexdigest(),'bytes':len(stream_source.encode()),'rtpTimestampSites':stream_sites,'nativeLoadSites':load_sites,'videoQueueFastPath':True,'directVideoReceive':True,'alignedOwnedVideoHeaders':True,'videoReceiveSourceSha256':VIDEO_RECEIVE_SHA256,'videoQueueSourceSha256':VIDEO_QUEUE_SHA256,'rawSha256':hashlib.sha256(raw_stream.encode()).hexdigest()},
            'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(), 'bytes': artifact.stat().st_size,
            'sources': {name: subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()
                        for name, path in [('moonlight-common-c', core), ('enet', core / 'enet'),
                                           ('nanors', core / 'nanors'), ('mbedtls', root / 'third_party/mbedtls')]}}
(dist / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Built {dist / artifact.name} ({artifact.stat().st_size:,} bytes), {len(public)} upstream API exports')
