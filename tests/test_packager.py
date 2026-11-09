import base64
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import package_payload as packager
import package_payload as pm


class PackagerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root/'app.js').write_text('(async function(){return 42;})();', encoding='utf-8')
        (self.root/'lib.js').write_text('var greeting="雪";', encoding='utf-8')

    def flags(self):
        return [str(self.root), '--non-interactive', '--id', 'test-app', '--name', 'Test App',
                '--creator', 'Test Creator', '--version', '1.2.3', '--description', 'Example',
                '--api', '1', '--script', 'lib.js', '--script', 'app.js']

    def run_tool(self, flags):
        with contextlib.redirect_stdout(io.StringIO()):
            return packager.main(flags)

    def test_all_settings_from_ci_and_deterministic_manifest_reuse(self):
        icon = ROOT/'app/assets/moonlight-switch.png'
        (self.root/'logo.png').write_bytes(icon.read_bytes())
        output = self.root/'result.civapp'
        self.assertEqual(self.run_tool(self.flags()+['--icon', 'logo.png', '-o', str(output)]), 0)
        package = pm.read_package(output)
        self.assertEqual(package['metadata'], {'author':'Test Creator','release':'1.2.3','description':'Example','api':1})
        self.assertEqual([s['name'] for s in package['scripts']], ['lib.js','app.js'])
        self.assertEqual(base64.b64decode(package['icon'][22:]), icon.read_bytes())
        before = output.read_bytes()
        self.assertEqual(self.run_tool([str(self.root), '--non-interactive', '-o', str(output)]), 0)
        self.assertEqual(output.read_bytes(), before)

    def test_wizard_prompts_and_saves_reusable_metadata_without_generated_art(self):
        answers = [str(self.root), 'Sample App', '', 'Creator', '0.1.0', '', 'lib.js,app.js', 'yes']
        with patch('sys.stdin.isatty', return_value=True), patch('builtins.input', side_effect=answers) as prompt:
            self.assertEqual(self.run_tool([]), 0)
        self.assertEqual(prompt.call_count, len(answers))
        manifest = json.loads((self.root/'payload.json').read_text())
        self.assertEqual(manifest['id'], 'sample-app')
        self.assertIsNone(manifest['icon'])
        self.assertFalse((self.root/'icon.png').exists())
        self.assertEqual(pm.read_package(self.root/'dist/sample-app.civapp')['icon'], '')
        # Reusing an explicit no-icon decision never prompts again.
        self.assertEqual(self.run_tool([str(self.root), '--non-interactive']), 0)

    def test_missing_icon_requires_explicit_ci_decision_and_decline_changes_nothing(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            self.run_tool(self.flags())
        self.assertEqual(error.exception.code, 1)
        self.assertFalse((self.root/'payload.json').exists())
        with patch('sys.stdin.isatty', return_value=True), patch('builtins.input', return_value='no'):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                self.run_tool([s for s in self.flags() if s != '--non-interactive'])
        self.assertFalse((self.root/'dist').exists())

    def test_read_only_ci_override_preserves_manifest_and_emits_no_art(self):
        self.run_tool(self.flags()+['--no-icon'])
        before = (self.root/'payload.json').read_bytes()
        self.run_tool([str(self.root), '--non-interactive', '--version', '2.0.0', '--no-icon', '--no-save-metadata'])
        self.assertEqual((self.root/'payload.json').read_bytes(), before)
        self.assertEqual(pm.read_package(self.root/'dist/test-app.civapp')['metadata']['release'], '2.0.0')
        self.assertFalse((self.root/'icon.png').exists())

    def test_partial_manifest_unknown_fields_preserved_and_missing_fields_prompted(self):
        (self.root/'payload.json').write_text(json.dumps({'name':'Existing','id':'existing','scripts':['app.js'],'icon':None,'source':'https://example.com'}))
        with patch('sys.stdin.isatty', return_value=True), patch('builtins.input', side_effect=['Creator','3.0','']) as prompt:
            self.run_tool([str(self.root)])
        self.assertEqual(prompt.call_count, 3)
        manifest = json.loads((self.root/'payload.json').read_text())
        self.assertEqual(manifest['source'], 'https://example.com')
        self.assertEqual(manifest['release'], '3.0')

    def test_invalid_inputs_do_not_modify_source_or_output(self):
        for flags in [self.flags()+['--no-icon','--script','../escape.js'],
                      self.flags()+['--icon','missing.png'],
                      self.flags()+['--no-icon','--name',''],
                      self.flags()+['--no-icon','--id','../bad']]:
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                self.run_tool(flags)
            self.assertFalse((self.root/'payload.json').exists())
            self.assertFalse((self.root/'dist').exists())

    def test_non_tty_cli_fails_fast_without_waiting_for_input(self):
        result = subprocess.run([sys.executable, '-B', str(ROOT/'tools/package_payload.py'), str(self.root)],
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertIn('--name', result.stderr)

    def test_symlink_escape_rejected_before_publishing(self):
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside)/'secret.js'
            target.write_text('var privateData = 1;', encoding='utf-8')
            (self.root/'escape.js').symlink_to(target)
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                self.run_tool(self.flags()+['--no-icon', '--script', 'escape.js'])
        self.assertFalse((self.root/'payload.json').exists())
        self.assertFalse((self.root/'dist').exists())

    def test_inspect_cli_validates_packages_and_rejects_corruption(self):
        self.run_tool(self.flags()+['--no-icon'])
        output = self.root/'dist/test-app.civapp'
        command = [sys.executable, '-B', str(ROOT/'tools/package_payload.py'), '--inspect', str(output)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Scripts: lib.js, app.js', result.stdout)
        package = json.loads(output.read_text())
        package['scripts'][0]['name'] = '../escape.js'
        output.write_text(json.dumps(package))
        result = subprocess.run(command, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Invalid or duplicate script name', result.stderr)

    def test_single_copied_file_runs_in_unrelated_repository_without_imports(self):
        standalone = self.root/'ci/package_payload.py'
        standalone.parent.mkdir()
        standalone.write_bytes((ROOT/'tools/package_payload.py').read_bytes())
        output = self.root/'artifacts/example.civapp'
        command = [sys.executable, '-I', '-B', str(standalone)]
        flags = self.flags()+['--no-icon', '--no-save-metadata', '-o', str(output)]
        result = subprocess.run(command+flags, cwd=standalone.parent,
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root/'payload.json').exists())
        package = json.loads(output.read_text())
        self.assertEqual(package['id'], 'test-app')
        self.assertEqual([script['name'] for script in package['scripts']], ['lib.js', 'app.js'])
        self.assertEqual(package['scripts'][0]['source'], 'var greeting="雪";')
        result = subprocess.run(command+['--inspect', str(output)], cwd=standalone.parent,
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Test App', result.stdout)


if __name__ == '__main__':
    unittest.main()
