"""Bounded in-memory payload and module upload for the CivSwitch loader."""
import hashlib
import json
import socket
import sys
import time

def send_payload(host, payload, output, timeout=60):
    if len(payload) >= 500 * 1024:
        raise ValueError('Payload exceeds the CivSwitch 500 KiB limit')
    with socket.create_connection((host, 9026), timeout=10) as connection:
        connection.settimeout(1)
        connection.sendall(payload)
        connection.shutdown(socket.SHUT_WR)
        deadline = time.monotonic() + timeout
        tail, completed, failed = b'', False, False
        while time.monotonic() < deadline:
            try:
                chunk = connection.recv(4096)
            except socket.timeout:
                continue
            if not chunk:
                break
            if output is not sys.stdout.buffer:
                output.write(chunk); output.flush()
            sys.stdout.buffer.write(chunk); sys.stdout.buffer.flush()
            scan = tail + chunk
            completed = completed or b'Executed successfully' in scan
            failed = failed or b'Error in payload:' in scan or b'MOONLIGHT_STREAM_ERROR:' in scan
            tail = scan[-1024:]
        if not completed or failed:
            raise RuntimeError('Payload did not complete successfully; inspect logs before sending another payload')

def upload_module(host, source, output):
    digest = hashlib.sha256(source.encode()).hexdigest()
    chunks = [source[i:i+150000] for i in range(0, len(source), 150000)]
    for index, chunk in enumerate(chunks):
        if index == 0:
            state = {'sha256': digest, 'length': len(source), 'count': len(chunks), 'parts': []}
            script = 'window.__moonlightStreamModuleUpload=' + json.dumps(state) + ';\n'
        else:
            script = ('if(!window.__moonlightStreamModuleUpload||window.__moonlightStreamModuleUpload.sha256!==' +
                      json.dumps(digest) + '||window.__moonlightStreamModuleUpload.parts.length!==' + str(index) +
                      ')throw Error("Streaming module upload mismatch");\n')
        script += 'window.__moonlightStreamModuleUpload.parts.push(' + json.dumps(chunk) + ');\n'
        script += 'log("MOONLIGHT_STREAM_UPLOAD: ' + str(index+1) + '/' + str(len(chunks)) + '");'
        send_payload(host, script.encode(), output)
    return digest
