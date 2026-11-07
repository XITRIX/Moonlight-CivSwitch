#!/usr/bin/env python3
"""Build the complete upstream C core as a self-contained wasm2js library."""
import json
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess

here = Path(__file__).resolve().parent
investigation = here.parent
sdk = investigation / 'toolchains/emsdk'
core = investigation / 'references/moonlight-common-c'
lock = json.loads((here / 'sources.lock.json').read_text())
build = here / 'build'
dist = here / 'dist'
build.mkdir(exist_ok=True)
dist.mkdir(exist_ok=True)
if not (sdk / '.emscripten').exists():
    raise SystemExit('Activate the local Emscripten 3.1.74 SDK first; see README.md')
for name, path in [('moonlight-common-c', core), ('mbedtls', investigation / 'references/mbedtls'), ('emsdk', sdk),
                   ('enet', core / 'enet'), ('nanors', core / 'nanors'),
                   ('mbedtls-framework', investigation / 'references/mbedtls/framework')]:
    actual = subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()
    expected = lock[name]['commit'] if isinstance(lock[name], dict) else lock[name]
    if actual != expected:
        raise SystemExit(f'Revision mismatch for {name}: {actual} != {expected}')
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
    '_ml_runtime_pump','_ml_runtime_tasks','_ml_session_start','_ml_session_stop',
    '_ml_session_state','_ml_session_error','_ml_session_video_frames','_ml_session_audio_frames',
    '_ml_scheduler_test_start','_ml_scheduler_test_result','_ml_network_test_start','_ml_network_test_result',
    '_ml_png_nv12','_ml_png_release','_ml_session_gamepad','_ml_session_key']
(build / 'stream-exports.json').write_text(json.dumps(stream_exports))
subprocess.run([str(sdk / 'upstream/emscripten/emcmake'), 'cmake', '-S', str(here), '-B', str(build),
                '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5'], env=env, check=True)
subprocess.run(['cmake', '--build', str(build), '--parallel', '8'], env=env, check=True)
artifact = build / 'moonlight-core.js'
shutil.copy2(artifact, dist / artifact.name)
shutil.copy2(build / 'fiber-proof.js', dist / 'fiber-proof.js')
shutil.copy2(build / 'moonlight-stream.js', dist / 'moonlight-stream.js')
licenses = dist / 'licenses'
licenses.mkdir(exist_ok=True)
for name, source in [('moonlight-common-c', core / 'LICENSE.txt'), ('enet', core / 'enet/LICENSE'),
                     ('nanors', core / 'nanors/LICENSE'), ('mbedtls', investigation / 'references/mbedtls/LICENSE'),
                     ('emscripten', sdk / 'upstream/emscripten/LICENSE')]:
    shutil.copy2(source, licenses / (name + '.txt'))
manifest = {'format': 'wasm2js', 'emscripten': '3.1.74', 'exports': exports,
            'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(), 'bytes': artifact.stat().st_size,
            'sources': {name: subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()
                        for name, path in [('moonlight-common-c', core), ('enet', core / 'enet'),
                                           ('nanors', core / 'nanors'), ('mbedtls', investigation / 'references/mbedtls')]}}
(dist / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Built {dist / artifact.name} ({artifact.stat().st_size:,} bytes), {len(public)} upstream API exports')
