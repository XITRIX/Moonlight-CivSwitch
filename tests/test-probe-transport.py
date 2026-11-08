"""Exercise the real JS wrapper with oversized and split Unicode messages."""
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import io
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'investigation/probes'))
from probe_transport import LogDecoder, wrap_payload
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from civswitch_sender import prepare_payload, send_staged_payload, upload_module
import send_ui


class ProbeTransportTests(unittest.TestCase):
    def test_ui_streaming_default_debug_opt_out_and_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            artifact = root / 'dist/runtime/moonlight-stream.js'
            artifact.parent.mkdir(parents=True)
            artifact.write_text('streaming core')
            for flags, streaming in [([], True), (['--no-streaming'], False), (['--clear-switch-data'], False)]:
                # UI debugging and cleanup must work without a built core.
                if not streaming:
                    artifact.unlink(missing_ok=True)
                with self.subTest(flags=flags), \
                     patch.object(sys, 'argv', ['send_ui.py', 'test', '--port', '9123', *flags]), \
                     patch.object(sys, 'stdout', io.TextIOWrapper(io.BytesIO())), \
                     patch.object(send_ui, 'APP_DIR', root / 'app'), \
                     patch.object(send_ui, 'build_payload', return_value=b'app') as build, \
                     patch.object(send_ui, 'upload_module') as upload, \
                     patch.object(send_ui, 'prepare_payload', return_value=b'app'), \
                     patch.object(send_ui.socket, 'create_connection') as connect:
                    connect.return_value.__enter__.return_value.recv.return_value = b''
                    send_ui.main()
                    build.assert_called_once_with('--clear-switch-data' in flags)
                    self.assertEqual(upload.call_count, int(streaming))
                    if streaming:
                        self.assertEqual(upload.call_args.args[:2], ('test', 'streaming core'))
                        self.assertEqual(upload.call_args.kwargs, {'port': 9123})
                    connect.assert_called_once_with(('test', 9123), timeout=10)

    def test_missing_default_runtime_fails_before_upload_or_connection(self):
        with tempfile.TemporaryDirectory() as folder, \
             patch.object(sys, 'argv', ['send_ui.py', 'test']), \
             patch.object(sys, 'stderr', io.StringIO()) as errors, \
             patch.object(send_ui, 'APP_DIR', Path(folder) / 'app'), \
             patch.object(send_ui, 'build_payload', return_value=b'app'), \
             patch.object(send_ui, 'upload_module') as upload, \
             patch.object(send_ui.socket, 'create_connection') as connect:
            with self.assertRaises(SystemExit) as stopped:
                send_ui.main()
            self.assertEqual(stopped.exception.code, 1)
            self.assertIn('npm run build', errors.getvalue())
            self.assertIn('--no-streaming', errors.getvalue())
            upload.assert_not_called()
            connect.assert_not_called()

    def test_runtime_chunks_follow_the_custom_loader_port(self):
        with patch('civswitch_sender.send_payload') as send:
            upload_module('test', 'x' * 160000, io.BytesIO(), port=9123)
        self.assertEqual(send.call_count, 2)
        for call in send.call_args_list:
            self.assertEqual(call.kwargs, {'port': 9123})

    def test_staged_payloads_stay_bounded_preserve_scope_and_clear_ram_state(self):
        for filler in ['x' * 600000, '😀' * 150000]:
            calls = []
            source = ('/*' + filler + '*/(async function(){await log("ran");window.result=nativeSentinel;})();').encode()
            def collect(host, payload, output, timeout=60, port=9026):
                self.assertLess(len(payload),500*1024)
                calls.append(payload.decode())
            with patch('civswitch_sender.send_payload',collect):
                send_staged_payload('test',source,io.BytesIO())
            runner = '''const window={},nativeSentinel=42;async function log(){}
(async()=>{for(const script of SCRIPTS)await eval(script);
if(window.result!==42||window.__moonlightStagedProbe!==undefined)throw Error('Staged scope or cleanup failed');
})().catch(e=>{console.error(e);process.exitCode=1;});'''.replace('SCRIPTS',json.dumps(calls))
            subprocess.run(['node'],input=runner,text=True,check=True,capture_output=True)

    def test_ui_staging_preserves_lifetime_and_custom_port(self):
        calls = []
        def collect(host, payload, output, timeout=60, port=9026):
            self.assertEqual(port, 9123)
            self.assertLess(len(payload), 500 * 1024)
            calls.append(payload.decode())
        source = ('/*' + 'x' * 520000 + '*/(async function(){window.started=nativeSentinel;await new Promise(r=>window.closeUI=r);window.finished=true;})();').encode()
        with patch('civswitch_sender.send_payload', collect):
            execute = prepare_payload('test', source, io.BytesIO(), port=9123)
        runner = '''const window={},nativeSentinel=42;async function log(){}
(async()=>{for(const script of SCRIPTS)await eval(script);
const running=eval(EXECUTE);
if(window.started!==42||window.finished)throw Error('UI did not start or lifetime ended early');
window.closeUI();await running;
if(!window.finished||window.__moonlightStagedProbe!==undefined)throw Error('UI cleanup failed');
})().catch(e=>{console.error(e);process.exitCode=1;});'''.replace('SCRIPTS',json.dumps(calls)).replace('EXECUTE',json.dumps(execute.decode()))
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
