"""Exercise the real JS wrapper with oversized and split Unicode messages."""
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import io

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'investigation/probes'))
from probe_transport import LogDecoder, wrap_payload
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from civswitch_sender import send_staged_payload


class ProbeTransportTests(unittest.TestCase):
    def test_staged_payloads_stay_bounded_preserve_scope_and_clear_ram_state(self):
        for filler in ['x' * 600000, '😀' * 150000]:
            calls = []
            source = ('/*' + filler + '*/(async function(){await log("ran");window.result=nativeSentinel;})();').encode()
            def collect(host, payload, output, timeout=60):
                self.assertLess(len(payload),500*1024)
                calls.append(payload.decode())
            with patch('civswitch_sender.send_payload',collect):
                send_staged_payload('test',source,io.BytesIO())
            runner = '''const window={},nativeSentinel=42;async function log(){}
(async()=>{for(const script of SCRIPTS)await eval(script);
if(window.result!==42||window.__moonlightStagedProbe!==undefined)throw Error('Staged scope or cleanup failed');
})().catch(e=>{console.error(e);process.exitCode=1;});'''.replace('SCRIPTS',json.dumps(calls))
            subprocess.run(['node'],input=runner,text=True,check=True,capture_output=True)

    def test_large_logs_are_bounded_and_reassembled(self):
        messages = ['short', 'a' * 8192, '\x00' * 4096, 'x' * 255 + '😀' * 700]
        source = '(async function(){for(var m of ' + json.dumps(messages) + ')await log(m);if(nativeSentinel!==42)throw Error("Lost scope");})();'
        wrapped = wrap_payload(source).decode()
        runner = '''const lines=[]; const window={};
const original=window.log=async x=>lines.push(x); const nativeSentinel=42;
Object.defineProperty(globalThis,'log',{get:()=>window.log});
(async()=>{await eval(WRAPPED); if(window.log!==original)throw Error('Not restored');
process.stdout.write(JSON.stringify(lines));})().catch(e=>{console.error(e);process.exitCode=1;});'''.replace('WRAPPED', json.dumps(wrapped))
        result = subprocess.run(['node', '-e', runner], check=True, capture_output=True, text=True)
        lines = json.loads(result.stdout)
        self.assertTrue(all(len((line + '\n').encode('utf-8')) < 2048 for line in lines))
        wire = ('\n'.join(lines) + '\n').encode()
        decoder = LogDecoder()
        decoded = []
        for offset in range(0, len(wire), 17):
            decoded.extend(decoder.feed(wire[offset:offset + 17]))
        decoder.finish()
        self.assertEqual(decoded, messages)

    def test_incomplete_log_is_rejected(self):
        decoder = LogDecoder()
        decoder.feed(b'MOONLIGHT_PROBE_LOG_PART: {"text":"lost", "last":false}\n')
        with self.assertRaises(ValueError):
            decoder.finish()


if __name__ == '__main__':
    unittest.main()
