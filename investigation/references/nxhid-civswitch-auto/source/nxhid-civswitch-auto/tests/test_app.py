"""Exercise the real Switch main loop with scripted service and input events."""

from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AppScreenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build = tempfile.TemporaryDirectory(prefix="nxhid-app-tests-")
        cls.addClassCleanup(cls.build.cleanup)
        directory = Path(cls.build.name)
        cls.executable = directory / "app"
        flags = ["cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
                 "-I" + str(ROOT / "tests/fakes"), "-I" + str(ROOT / "include")]
        subprocess.run(flags + ["-Dmain=nxhid_main", "-Dprintf=ui_test_printf", "-c",
                                str(ROOT / "source/main.c"), "-o", str(directory / "main.o")], check=True)
        subprocess.run(flags + [str(directory / "main.o"), str(ROOT / "tests/app_harness.c"),
                                "-o", str(cls.executable)], check=True)

    def frames(self, scenario):
        result = subprocess.run([str(self.executable), scenario], capture_output=True, text=True,
                                cwd=self.build.name, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        frames = [re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", frame)
                  for frame in result.stdout.split("\x1e") if frame]
        self.assertTrue(frames)
        # The default libnx console is 80 columns by 45 rows.
        for frame in frames:
            self.assertLessEqual(len(frame.splitlines()), 45)
            self.assertTrue(all(len(line) <= 80 for line in frame.splitlines()))
        return frames

    def test_disconnect_notice_clears_after_reconnect(self):
        frames = self.frames("disconnect")
        self.assertIn("Sender disconnected", frames[1])
        self.assertIn("192.0.2.20", frames[-1])
        self.assertNotIn("Sender disconnected", frames[-1])
        self.assertIn("Forwarding keyboard input", frames[-1])

    def test_reset_notice_clears_after_recovery(self):
        frames = self.frames("reset")
        self.assertIn("USB error 00005678", frames[1])
        self.assertNotIn("Keyboard ready", frames[1])
        self.assertIn("Keyboard ready", frames[-1])
        self.assertNotIn("USB error", frames[-1])

    def test_instructions_follow_current_connection_state(self):
        self.assertIn("Connect the Switch USB-C port", self.frames("waiting-usb")[-1])
        self.assertIn("Connect the Switch to Wi-Fi", self.frames("waiting-wifi")[-1])
        self.assertIn("Connect a sender", self.frames("ready")[-1])

    def test_startup_errors_identify_the_failed_service(self):
        for scenario, message in (
            ("focus-error", "Could not configure application focus"),
            ("socket-error", "Could not initialize networking"),
            ("wifi-error", "Could not initialize Wi-Fi"),
            ("usb-error", "Could not initialize the USB keyboard"),
            ("restart-error", "Could not restart the USB keyboard"),
        ):
            with self.subTest(scenario=scenario):
                frame = self.frames(scenario)[-1]
                self.assertIn(message, frame)
                self.assertIn("Result: 00001234", frame)

    def test_non_result_errors_do_not_display_success_codes(self):
        for scenario, message in (("applet-mode", "Full application mode required"),
                                  ("listen-error", "Cannot listen on TCP")):
            with self.subTest(scenario=scenario):
                frame = self.frames(scenario)[-1]
                self.assertIn(message, frame)
                self.assertNotIn("Result: 00000000", frame)

    def test_error_screen_is_only_rendered_in_focus(self):
        frames = self.frames("background-error")
        self.assertEqual(len(frames), 2)
        self.assertEqual(frames[0], frames[1])

    def test_background_buttons_do_not_close_the_app(self):
        self.assertIn("Forwarding keyboard input", self.frames("background-input")[-1])



class LocalPlaybackAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build = tempfile.TemporaryDirectory(prefix="nxhid-local-app-")
        cls.addClassCleanup(cls.build.cleanup)
        directory = Path(cls.build.name)
        cls.executable = directory / "app"
        flags = ["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-DNXHID_GAMEPAD",
                 "-I" + str(ROOT / "tests/fakes"), "-I" + str(ROOT / "include")]
        subprocess.run(flags + ["-Dmain=nxhid_main", "-Dprintf=ui_test_printf", "-c",
                               str(ROOT / "source/main.c"), "-o", str(directory / "main.o")], check=True)
        subprocess.run(flags + [str(directory / "main.o"), str(ROOT / "tests/app_harness.c"),
                                str(ROOT / "source/playback.c"), "-o", str(cls.executable)], check=True)

    def run_scenario(self, scenario, payload=True):
        with tempfile.TemporaryDirectory() as td:
            directory = Path(td)
            if payload:
                (directory / "payload.txt").write_text('1/2"abc\n2/2"def\n')
            result = subprocess.run([str(self.executable), scenario, str(directory / "nxhid.nro")],
                                    capture_output=True, text=True, timeout=5)
            log = directory / "usb.log"
            self.last_usb_log = log.read_text() if log.exists() else ""
        self.assertEqual(result.returncode, 0, result.stderr)
        return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", result.stdout)

    def test_minus_runs_payload_beside_nro_without_wifi(self):
        frames = self.run_scenario("local-run")
        self.assertIn("Wi-Fi not connected", frames)
        self.assertIn("Starting in 5 seconds", frames)
        self.assertIn("All 2 lines sent", frames)

    def test_missing_payload_has_a_clear_error(self):
        self.assertIn("Cannot open payload.txt", self.run_scenario("local-missing", payload=False))

    def test_b_cancels_local_playback(self):
        frames = self.run_scenario("local-cancel")
        self.assertIn("Stopped at line", frames)
        self.assertNotIn("All 2 lines sent", frames)

    def test_leaving_foreground_cancels_playback(self):
        frames = self.run_scenario("local-background")
        self.assertIn("NXHID not in foreground", frames)
        self.assertNotIn("All 2 lines sent", frames)


    def test_error_stage_is_visible_and_saved_then_clears_without_remote_client(self):
        frames = self.run_scenario("local-reset")
        self.assertIn("USB error:  00025c8c", frames)
        self.assertIn("Stage:      if0 OUT ep02 queue", frames)
        self.assertIn("module=140 description=302", self.last_usb_log)
        self.assertIn("stage=if0 OUT ep02 queue", self.last_usb_log)
        final = frames.split("\x1e")[-2]
        self.assertIn("Keyboard ready", final)
        self.assertNotIn("USB error", final)

    def test_repeated_errors_back_off_instead_of_resetting_every_frame(self):
        frames = self.run_scenario("local-reset-loop")
        self.assertIn("Waiting for USB host", frames)
        self.assertNotIn("USB:        Keyboard ready", frames)
        self.assertLessEqual(self.last_usb_log.count("error=00025c8c"), 41)


    def test_waiting_status_names_the_blocked_interface(self):
        frames = self.run_scenario("local-pad-wait")
        self.assertIn("USB:        Waiting for controller input polling", frames)
        self.assertIn("Readiness:  desc=yes key=ok pad=wait", frames)
        self.assertNotIn("All 2 lines sent", frames)
