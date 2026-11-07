"""Offline SD playback: complete report sequence, timing, file validation and stop."""
from pathlib import Path
import subprocess
import tempfile
import unittest
import test_nxhid as base

nx = base.nxhid
ROOT = base.ROOT

class PlaybackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temp.cleanup)
        cls.exe = Path(cls.temp.name)/"playback"
        subprocess.run(["cc","-std=c11","-Wall","-Wextra","-Werror","-I"+str(ROOT/"include"),
                        str(ROOT/"source/playback.c"),str(ROOT/"tests/playback_harness.c"),"-o",str(cls.exe)],check=True)

    def run_harness(self, mode, text=None, path=None):
        with tempfile.TemporaryDirectory() as td:
            if text is not None:
                path = Path(td)/"payload.txt"
                path.write_bytes(text if isinstance(text, bytes) else text.encode("ascii"))
            result = subprocess.run([str(self.exe),mode]+([str(path)] if path is not None else []),
                                    capture_output=True,text=True,timeout=5)
        return result

    def test_ascii_and_caps_lock_match_the_existing_client(self):
        result=self.run_harness("ascii")
        self.assertEqual(result.returncode,0,result.stderr)
        for row in result.stdout.splitlines():
            lock,c,mod,key=map(int,row.split())
            expected_mod,expected_key=nx.character_key(chr(c))
            if 4<=expected_key<=29 and lock:expected_mod^=2
            self.assertEqual((mod,key),(expected_mod,expected_key))

    def test_payload_path_follows_the_actual_nro_directory(self):
        for nro,expected in [("sdmc:/switch/nxhid/nxhid.nro","sdmc:/switch/nxhid/payload.txt"),
                             ("/switch/custom/mytool.nro","/switch/custom/payload.txt"),
                             ("nxhid.nro","sdmc:/switch/nxhid/payload.txt")]:
            result=self.run_harness("path",path=nro)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(result.stdout.strip(),expected)

    def test_full_87_line_macro_has_exact_order_and_short_local_holds(self):
        lines=['%d/87\"><div class=\"9/87 8888 aA!`' % i for i in range(1,88)]
        result=self.run_harness("run",'\n'.join(lines)+'\n')
        self.assertEqual(result.returncode,0,result.stderr)
        events=[(row.split()[0],int(row.split()[1]),bytes.fromhex(row.split()[2]))
                for row in result.stdout.splitlines() if not row.startswith("END")]
        expected=[('K',nx.RELEASE),('P',nx.PAD_NEUTRAL)]
        for _ in range(5):expected.extend([('P',nx.pad_report('A')),('P',nx.PAD_NEUTRAL)])
        for i,line in enumerate(lines):
            expected.extend([('K',nx.chord_report('ESC')),('K',nx.RELEASE),
                             ('P',nx.pad_report('A')),('P',nx.PAD_NEUTRAL)])
            for char in line:
                mod,key=nx.character_key(char)
                expected.extend([('K',nx.make_report(mod,[key])),('K',nx.RELEASE)])
            for _ in range(2):expected.extend([('K',nx.chord_report('ENTER')),('K',nx.RELEASE)])
            if i+1<len(lines):expected.extend([('P',nx.pad_report('A')),('P',nx.PAD_NEUTRAL)])
        self.assertEqual([(kind,report) for kind,_,report in events],expected)
        for i,(kind,timestamp,report) in enumerate(events):
            if kind=='K' and report!=nx.RELEASE:
                self.assertEqual(events[i+1][2],nx.RELEASE)
                self.assertEqual(events[i+1][1]-timestamp,45) # 5 ms USB delivery + 40 ms hold.
        self.assertTrue(result.stdout.rstrip().endswith('END 2 86 87'))

    def test_caps_are_compensated_during_offline_playback(self):
        result=self.run_harness("caps",'1/1\"aAzZ\n')
        self.assertEqual(result.returncode,0,result.stderr)
        pressed=[bytes.fromhex(row.split()[2]) for row in result.stdout.splitlines()
                 if row.startswith('K ') and bytes.fromhex(row.split()[2])!=nx.RELEASE]
        self.assertIn(nx.make_report(2,[4]),pressed)
        self.assertIn(nx.make_report(0,[4]),pressed)

    def test_cancel_usb_failure_and_focus_loss_release_all_input(self):
        for mode in ('cancel','failure','unavailable'):
            result=self.run_harness(mode,'1/1\"8888\n')
            self.assertEqual(result.returncode,0,result.stderr)
            rows=[row for row in result.stdout.splitlines() if not row.startswith('END')]
            self.assertEqual(rows[-2].split()[2],nx.RELEASE.hex())
            self.assertEqual(rows[-1].split()[2],nx.PAD_NEUTRAL.hex())

    def test_payload_validation_rejects_corruption_and_accepts_crlf(self):
        good='1/2\"abc\r\n2/2\"def\r\n'
        result=self.run_harness('validate',good)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(result.stdout.strip(),'2')
        for bad in [b'',b'1/1\"abc\n\n',b'9/887\"x\n',b'1/1\"'+b'x'*250,
                    b'1/1\"\x00hidden\n',b'1/1\"\t\n',b'1/1\"\xff\n',b'x'*(1024*1024+1)]:
            result=self.run_harness('validate',bad)
            self.assertEqual(result.returncode,2,result.stderr)
