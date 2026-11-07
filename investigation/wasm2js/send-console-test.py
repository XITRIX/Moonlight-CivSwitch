#!/usr/bin/env python3
"""Upload a large JS library in bounded loader payloads, then run diagnostics."""
import argparse
import hashlib
import json
from pathlib import Path
import socket
import sys
import time

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('console_ip')
parser.add_argument('--output', type=Path, default=here.parent / 'evidence/wasm2js-console-tests.txt')
args = parser.parse_args()
source = (here / 'dist/moonlight-core.js').read_text()
digest = hashlib.sha256(source.encode()).hexdigest()
chunks = [source[i:i + 150000] for i in range(0, len(source), 150000)]

def send(payload, output):
    data = payload.encode()
    if len(data) >= 500 * 1024:
        raise SystemExit('Payload exceeds the loader limit')
    with socket.create_connection((args.console_ip, 9026), timeout=10) as connection:
        connection.settimeout(1)
        connection.sendall(data)
        connection.shutdown(socket.SHUT_WR)
        deadline = time.monotonic() + 60
        tail = b''
        completed = failed = False
        while time.monotonic() < deadline:
            try:
                chunk = connection.recv(4096)
            except socket.timeout:
                continue
            if not chunk:
                break
            output.write(chunk); output.flush()
            sys.stdout.buffer.write(chunk); sys.stdout.buffer.flush()
            tail = (tail + chunk)[-2048:]
            failed = failed or b'Error in payload:' in tail or b'MOONLIGHT_WASM2JS_ERROR:' in tail
            completed = completed or b'Executed successfully' in tail
        if not completed or failed:
            raise SystemExit('Probe did not succeed; do not automatically resend into a running payload. Inspect the log.')

args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open('wb') as output:
    for index, chunk in enumerate(chunks):
        if index == 0:
            metadata = {'count': len(chunks), 'length': len(source), 'sha256': digest, 'parts': []}
            payload = 'window.__moonlightWasm2jsUpload=' + json.dumps(metadata) + ';\n'
        else:
            payload = ('if(!window.__moonlightWasm2jsUpload||window.__moonlightWasm2jsUpload.sha256!==' +
                       json.dumps(digest) + '||window.__moonlightWasm2jsUpload.parts.length!==' + str(index) +
                       ')throw Error("Core upload state mismatch");\n')
        payload += 'window.__moonlightWasm2jsUpload.parts.push(' + json.dumps(chunk) + ');\n'
        payload += 'log("MOONLIGHT_WASM2JS_UPLOAD: ' + str(index + 1) + '/' + str(len(chunks)) + '");'
        send(payload, output)
    helpers = (here.parent / 'probes/native-probe-helpers.js').read_text()
    probe = (here / 'probe-console.js').read_text()
    send(helpers + ';\n' + probe, output)
