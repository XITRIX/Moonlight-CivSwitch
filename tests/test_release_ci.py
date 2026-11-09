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
import release_ci as release
real_release_lookup = release.release_by_tag


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(release, 'release_by_tag', return_value=None)
        self.lookup = patcher.start()
        self.addCleanup(patcher.stop)

    def test_drafts_use_cli_lookup_and_pending_tags_cannot_be_overwritten(self):
        metadata = {'databaseId': 27, 'isDraft': True, 'tagName': 'v1.3.0'}
        with patch.object(release, 'gh', return_value=json.dumps(metadata)) as gh:
            self.assertEqual(real_release_lookup('test/app', 'v1.3.0'), metadata)
            self.assertEqual(gh.call_args.args[:2], ('release', 'view'))
        for message in ['release not found\n', 'HTTP 403: forbidden']:
            error = subprocess.CalledProcessError(1, ['gh'], stderr=message)
            with patch.object(release, 'gh', side_effect=error):
                if message.startswith('release not found'):
                    self.assertIsNone(real_release_lookup('test/app', 'v1.3.0'))
                else:
                    with self.assertRaises(RuntimeError):
                        real_release_lookup('test/app', 'v1.3.0')
        self.lookup.return_value = metadata
        with patch.object(release, 'api', return_value=None), self.assertRaisesRegex(ValueError, 'already exists'):
            release.unused('test/app', 'v1.3.0')
    def test_stable_versions_normalize_and_reject_shell_inputs_prereleases_and_non_semver(self):
        self.assertEqual(release.version('v1.3.0'), '1.3.0')
        self.assertTrue(release.newer('1.10.0', 'v1.9.0'))
        for value in ['1.2', '01.2.3', '1.2.3-rc.1', '1.2.3+build', '1.2.3\n', '1.2.3; echo secret', '$(env)', None]:
            with self.assertRaises(ValueError):
                release.version(value)

    def test_independent_component_versions_preserve_unchanged_source_across_skipped_releases(self):
        baseline = {'core': {'release': '1.2.0', 'source': 'same core'},
                    'launcher': {'release': '1.2.0', 'source': 'old launcher'}}
        self.assertEqual(release.component_versions({'core': 'same core', 'launcher': 'new launcher'}, baseline, '1.3.0'),
                         {'core': '1.2.0', 'launcher': '1.3.0'})
        self.assertEqual(release.component_versions({'core': 'same core', 'launcher': 'old launcher'}, baseline, '1.3.0'),
                         {'core': '1.2.0', 'launcher': '1.2.0'})
        with self.assertRaises(ValueError):
            release.component_versions({'core': 'changed'}, baseline, '1.1.0')

    def test_prepare_first_release_and_reject_duplicates_and_non_increasing_versions(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)/'release'
            def api(path, missing=False):
                return {'id': 5} if path == 'repos/test/app' else None
            with patch.object(release, 'api', side_effect=api), patch.dict('os.environ', {'GITHUB_OUTPUT': ''}), contextlib.redirect_stdout(io.StringIO()):
                plan = release.prepare('v1.3.0', 'test/app', 'a'*40, 'moonlight', directory)
            self.assertEqual(plan['version'], '1.3.0')
            self.assertIsNone(plan['previous'])
            self.assertEqual(json.loads((directory/'plan.json').read_text())['target'], 'a'*40)
            with patch.object(release, 'api', return_value={'id': 3, 'tag_name': 'v1.3.0'}), self.assertRaises(ValueError):
                release.prepare('1.2.0', 'test/app', 'a'*40, 'moonlight', Path(temporary)/'other')
            with patch.object(release, 'api', side_effect=[{'id': 5}, None, {'ref': 'existing'}]), self.assertRaisesRegex(ValueError, 'already exists'):
                release.prepare('1.3.0', 'test/app', 'a'*40, 'moonlight', Path(temporary)/'duplicate')

    def test_api_only_treats_404_as_missing_and_prepare_does_not_hide_repository_errors(self):
        for code in [404, 403, 500]:
            error = subprocess.CalledProcessError(1, ['gh'], stderr='failed (HTTP '+str(code)+')')
            with patch.object(release, 'gh', side_effect=error):
                if code == 404:
                    self.assertIsNone(release.api('repos/test/app/releases/latest', missing=True))
                else:
                    with self.assertRaises(RuntimeError):
                        release.api('repos/test/app/releases/latest', missing=True)
        with patch.object(release, 'api', side_effect=RuntimeError('repository inaccessible')), self.assertRaises(RuntimeError):
            release.prepare('1.3.0', 'test/app', 'a'*40, 'moonlight', Path('unused'))

    def test_previous_homebrew_snapshot_requires_and_downloads_all_three_assets(self):
        previous = {'id': 1, 'tag_name': 'v1.2.0', 'assets': [{'name': name, 'state': 'uploaded'} for name in
                    ['civhomebrew-release.json', 'core.civupdate', 'launcher.civupdate']]}
        def api(path, missing=False):
            if path.endswith('/latest'):
                return previous
            return {'id': 9} if path == 'repos/test/app' else None
        with tempfile.TemporaryDirectory() as temporary, patch.object(release, 'api', side_effect=api), patch.object(release, 'gh') as gh, patch.dict('os.environ', {'GITHUB_OUTPUT': ''}), contextlib.redirect_stdout(io.StringIO()):
            release.prepare('1.3.0', 'test/app', 'a'*40, 'civhomebrew', Path(temporary)/'valid')
            self.assertEqual(gh.call_count, 3)
            self.assertEqual({call.args[-1] for call in gh.call_args_list}, {'civhomebrew-release.json', 'core.civupdate', 'launcher.civupdate'})
            previous['assets'].pop()
            with self.assertRaisesRegex(ValueError, 'launcher.civupdate'):
                release.prepare('1.3.0', 'test/app', 'a'*40, 'civhomebrew', Path(temporary)/'invalid')
            previous['assets'] = []
            plan = release.prepare('1.3.0', 'test/app', 'a'*40, 'civhomebrew', Path(temporary)/'legacy')
            self.assertFalse(plan['baseline'])

    def test_moonlight_ci_package_uses_input_version_and_own_repository_without_modifying_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = {'id': 'moonlight-civswitch', 'name': 'Moonlight', 'author': 'Test', 'release': '1.0.0',
                        'scripts': ['app.js'], 'icon': None}
            (root/'payload.json').write_text(json.dumps(manifest))
            (root/'app.js').write_text('(async function(){return 42;})();')
            before = (root/'payload.json').read_bytes()
            with patch.object(release, 'ROOT', root), contextlib.redirect_stdout(io.StringIO()):
                files = release.build_moonlight({'version': '1.3.0', 'repository': 'test/fork'})
            package = json.loads(files[0].read_text())
            self.assertEqual(package['metadata']['release'], '1.3.0')
            self.assertEqual(package['metadata']['extensions']['updates'], {'schema': 1,
                             'releasesUrl': 'https://github.com/test/fork/releases/latest', 'asset': 'moonlight.civapp'})
            self.assertEqual((root/'payload.json').read_bytes(), before)

    @unittest.skipUnless((ROOT/'tools/payload_menu.py').exists(), 'CivHomebrew component builder only')
    def test_homebrew_builder_reuses_core_version_and_rejects_corrupt_baseline(self):
        import payload_menu as menu
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            baseline = directory/'previous'
            baseline.mkdir()
            images = {name: menu.system_package(name, menu.component_bundle(name)+("\n/* previous */" if name == 'launcher' else ''), '1.2.0') for name in ['core', 'launcher']}
            manifest = menu.release_manifest(images, '1.2.0')
            for name, image in images.items():
                (baseline/(name+'.civupdate')).write_text(json.dumps(image))
            manifest_path = baseline/'civhomebrew-release.json'
            manifest_path.write_text(json.dumps(manifest))
            plan = {'version': '1.3.0', 'repository': 'test/app', 'baseline': True, 'previous': {'tag': 'v1.2.0'}}
            with patch.object(menu, 'main') as build, patch.object(release.packager, 'main'):
                release.build_homebrew(plan, directory)
                self.assertEqual(build.call_args.args[0], ['build', '--release', '1.3.0', '--core-release', '1.2.0', '--launcher-release', '1.3.0'])
                manifest['components']['core']['checksum'] = '00000000'
                manifest_path.write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, 'disagree'):
                    release.build_homebrew(plan, directory)

    def publish_fixture(self, root):
        artifact = root/'dist/app.civapp'
        artifact.parent.mkdir()
        artifact.write_bytes(b'package')
        info = {'path': 'dist/app.civapp', 'bytes': 7, 'sha256': release.hashlib.sha256(b'package').hexdigest()}
        directory = root/'plan'
        directory.mkdir()
        plan = {'version': '1.3.0', 'tag': 'v1.3.0', 'repository': 'test/app', 'target': 'a'*40, 'kind': 'moonlight', 'previous': None}
        (directory/'plan.json').write_text(json.dumps(plan))
        (directory/'artifacts.json').write_text(json.dumps({'app.civapp': info}))
        (directory/'notes.md').write_text('Test release')
        return directory, artifact, info

    def test_publication_uploads_to_draft_verifies_assets_then_publishes_latest_at_exact_commit(self):
        for broken in [False, True]:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                directory, artifact, info = self.publish_fixture(root)
                created, calls = False, []
                def gh(*args):
                    nonlocal created
                    calls.append(args)
                    if args[:2] == ('release', 'create'):
                        created = True
                    return ''
                def api(path, missing=False):
                    if path.endswith('/releases/27') and created:
                        return {'assets': [{'name': 'app.civapp', 'state': 'uploaded', 'size': 8 if broken else 7,
                                            'digest': 'sha256:'+info['sha256']}]}
                    return None
                self.lookup.side_effect = lambda *args: {'databaseId': 27, 'isDraft': True, 'tagName': 'v1.3.0'} if created else None
                with patch.object(release, 'ROOT', root), patch.object(release, 'gh', side_effect=gh), patch.object(release, 'api', side_effect=api), contextlib.redirect_stdout(io.StringIO()):
                    if broken:
                        with self.assertRaisesRegex(ValueError, 'left unpublished'):
                            release.publish(directory)
                    else:
                        release.publish(directory)
                self.assertIn('--draft', calls[0])
                self.assertEqual(calls[0][calls[0].index('--target')+1], 'a'*40)
                self.assertEqual(len(calls), 1 if broken else 2)
                if not broken:
                    self.assertEqual(calls[-1][-2:], ('--draft=false', '--latest'))

    def test_changed_local_artifact_or_new_latest_release_stops_before_creation(self):
        for changed in [False, True]:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                directory, artifact, info = self.publish_fixture(root)
                if changed:
                    artifact.write_bytes(b'changed')
                with patch.object(release, 'ROOT', root), patch.object(release, 'gh') as gh, patch.object(release, 'api', return_value={'id': 2}):
                    with self.assertRaises(ValueError):
                        release.publish(directory)
                    gh.assert_not_called()

    def test_a_new_latest_during_upload_leaves_the_new_draft_unpublished(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory, artifact, info = self.publish_fixture(root)
            created, calls = False, []
            def gh(*args):
                nonlocal created
                calls.append(args)
                created = True
                return ''
            def api(path, missing=False):
                if path.endswith('/latest'):
                    return {'id': 99} if created else None
                if path.endswith('/releases/27') and created:
                    return {'assets': [{'name': 'app.civapp', 'state': 'uploaded', 'size': 7, 'digest': None}]}
                return None
            self.lookup.side_effect = lambda *args: {'databaseId': 27, 'isDraft': True, 'tagName': 'v1.3.0'} if created else None
            with patch.object(release, 'ROOT', root), patch.object(release, 'gh', side_effect=gh), patch.object(release, 'api', side_effect=api):
                with self.assertRaisesRegex(ValueError, 'draft left unpublished'):
                    release.publish(directory)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][:2], ('release', 'create'))


if __name__ == '__main__':
    unittest.main()
