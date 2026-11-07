#!/usr/bin/env python3
"""Send bounded investigation payloads and save their diagnostic output."""
import argparse
from pathlib import Path
import socket
import sys
import time
from probe_transport import LogDecoder, wrap_payload

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('console_ip')
parser.add_argument('scripts',nargs='+',type=Path)
parser.add_argument('--output',required=True,type=Path)
parser.add_argument('--timeout',type=int,default=90)
args=parser.parse_args()
payload=wrap_payload(';\n'.join(p.read_text() for p in args.scripts))
if len(payload)>=500*1024:
    parser.error('Payload exceeds 500 KiB')
args.output.parent.mkdir(parents=True,exist_ok=True)
with args.output.open('wb') as output:
    with socket.create_connection((args.console_ip,9026),timeout=10) as connection:
        # Uploads containing the crypto library can exceed a second on the LAN.
        # Apply the short polling timeout only after the whole payload is sent.
        connection.sendall(payload)
        connection.shutdown(socket.SHUT_WR)
        connection.settimeout(1)
        deadline=time.monotonic()+args.timeout
        completed=False
        failed=False
        decoder=LogDecoder()
        while time.monotonic()<deadline:
            try:
                chunk=connection.recv(4096)
            except socket.timeout:
                continue
            if not chunk:
                break
            for line in decoder.feed(chunk):
                if line == 'Executed successfully' or line.startswith('Error in payload:'):
                    completed=True
                failed=failed or line.startswith('Error in payload:')
                encoded=(line+'\n').encode('utf-8')
                output.write(encoded);output.flush()
                sys.stdout.buffer.write(encoded);sys.stdout.buffer.flush()
        else:
            raise SystemExit('Probe deadline reached; check whether its payload has finished before sending another.')
        if not completed:
            raise SystemExit('Connection ended without the loader completion marker; the payload may have crashed. Do not assume success.')
        decoder.finish()
        if failed:
            raise SystemExit('The loader reported a payload error; inspect the saved evidence.')
