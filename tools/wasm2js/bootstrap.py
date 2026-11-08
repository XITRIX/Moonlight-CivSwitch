#!/usr/bin/env python3
"""Download pinned local dependencies; no global SDK or shell configuration."""
import json
from pathlib import Path
import subprocess
import sys

here = Path(__file__).resolve().parent
root = here.parents[1]
lock = json.loads((root / 'third_party/sources.lock.json').read_text())

def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)

for name in ('moonlight-common-c', 'mbedtls', 'emsdk'):
    item = lock[name]
    destination = root / ('toolchains' if name == 'emsdk' else 'third_party') / name
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        run('git', 'clone', '--no-checkout', item['url'], destination)
        run('git', '-C', destination, 'checkout', '--detach', item['commit'])
    actual = subprocess.check_output(['git', '-C', str(destination), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != item['commit']:
        raise SystemExit(f'{destination} has revision {actual}; expected {item["commit"]}. No checkout was changed.')
    if name != 'emsdk':
        run('git', '-C', destination, 'submodule', 'update', '--init', '--recursive')

sdk = root / 'toolchains/emsdk/emsdk.py'
run(sys.executable, sdk, 'install', lock['emsdk']['version'])
run(sys.executable, sdk, 'activate', lock['emsdk']['version'])
