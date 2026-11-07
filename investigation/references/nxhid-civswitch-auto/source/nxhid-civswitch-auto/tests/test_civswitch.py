"""Composite USB boundary and automatic macro integration tests."""
import contextlib
import io
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
from unittest import mock
import test_nxhid as base

nx = base.nxhid
ROOT = base.ROOT


class CompositeUsbTests(unittest.TestCase):
    def test_real_backend_with_two_interfaces(self):
        with tempfile.TemporaryDirectory() as td:
            exe = str(Path(td) / "composite")
            subprocess.run(["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-DNXHID_GAMEPAD",
                            "-I" + str(ROOT / "tests/fakes"), "-I" + str(ROOT / "include"),
                            str(ROOT / "source/usb_composite.c"), str(ROOT / "tests/composite_harness.c"),
                            "-o", exe], check=True)
            subprocess.run([exe], check=True, timeout=5)
            subprocess.run([exe,"out-error"], check=True, timeout=5)
            subprocess.run([exe,"control-in-error"], check=True, timeout=5)
            for scenario in ("shared-setup", "primary-control", "delayed-shared-setup", "superseded-setup", "readiness-waits", "bus-reconfigure", "reset-during-control", "keyboard-out-and-echo", "descriptor-led-race", "descriptor-data-led-race", "readiness-reason"):
                subprocess.run([exe,scenario], check=True, timeout=5)


class AutomaticMacroTests(unittest.TestCase):
    def test_all_87_lines_have_controller_navigation_and_two_enters(self):
        lines = ['%d/87"><div class="aA!`' % i for i in range(1, 88)]
        client = mock.Mock()
        client.leds.return_value = 0
        with mock.patch.object(nx, "wait_with_heartbeat"), contextlib.redirect_stdout(io.StringIO()):
            nx.send_civ(client, lines)
        client.require_gamepad.assert_called_once()
        a = nx.pad_report("a")
        taps = client.tap.call_args_list
        pad = [call.args[0] for call in taps if call.kwargs.get("pad")]
        self.assertEqual(pad, [a] * (5+87+86))
        reports = [call.args[0] for call in taps if not call.kwargs.get("pad")]
        client.report.assert_not_called()
        client.pad_report.assert_not_called()
        client.require_taps.assert_called_once()
        self.assertEqual(reports.count(nx.chord_report("ESC")), 87)
        self.assertEqual(reports.count(nx.chord_report("ENTER")), 174)
        client.leds.return_value = 0

    def test_old_keyboard_build_stops_before_any_input(self):
        client = mock.Mock()
        client.require_gamepad.side_effect = RuntimeError("matching composite NXHID")
        with self.assertRaises(RuntimeError):
            nx.send_civ(client, ['1/1"x'])
        client.report.assert_not_called()
        client.pad_report.assert_not_called()
        client.request.assert_not_called()

    def test_caps_response_is_checked_and_button_mapping_matches_pico(self):
        client = nx.Client("unused")
        client.exchange = mock.Mock(return_value=b"CAPS KEYBOARD\n")
        with self.assertRaises(RuntimeError):
            client.require_gamepad()
        client.exchange.return_value = b"CAPS KEYBOARD GAMEPAD\n"
        client.require_gamepad()
        self.assertEqual(nx.pad_report("A"), bytes([4,0,8,128,128,128,128,0]))
        self.assertEqual(nx.pad_report("NONE"), nx.PAD_NEUTRAL)

    def test_bad_payload_fails_before_network_connection(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "payload.txt"
            for content in ['core.js', '1/2"x\n', '1/1"'+'x'*250, '1/1"\tx']:
                path.write_text(content, encoding="ascii")
                with mock.patch.object(nx.socket, "create_connection") as connect, contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(nx.main(["unused", "civ", str(path)]), 1)
                connect.assert_not_called()


class GamepadServerTests(unittest.TestCase):
    setUpClass = classmethod(base.ServerIntegrationTests.setUpClass.__func__)
    setUp = base.ServerIntegrationTests.setUp
    tearDown = base.ServerIntegrationTests.tearDown
    stop = base.ServerIntegrationTests.stop
    connect = base.ServerIntegrationTests.connect
    line = base.ServerIntegrationTests.line
    reports = base.ServerIntegrationTests.reports

    def start(self, fail=False):
        self.process = subprocess.Popen([str(self.executable), str(self.log), "ok", str(self.leds_file), "pad", str(Path(self.temp.name) / "timings.txt")],
                                        stdout=subprocess.PIPE, text=True)
        self.port = int(self.process.stdout.readline())

    def test_pad_tap_and_release_both_interfaces(self):
        with nx.Client("127.0.0.1", self.port) as client:
            client.require_gamepad()
            client.pad_report(nx.pad_report("A"))
            client.request("RELEASE")
        records = self.reports(5)
        self.assertEqual(records[:3], ["P"+nx.pad_report("A").hex(), nx.RELEASE.hex(), "P"+nx.PAD_NEUTRAL.hex()])
        self.assertIn("P"+nx.PAD_NEUTRAL.hex(), records[3:])

    def test_malformed_pad_drops_session_and_releases_both(self):
        sock = self.connect()
        sock.sendall(b"PAD 0400088080808000\n")
        self.assertEqual(self.line(sock), b"OK\n")
        sock.sendall(b"PAD 04c0098080808001\n")
        self.assertEqual(self.line(sock), b"")
        self.assertEqual(self.reports(3)[-2:], [nx.RELEASE.hex(), "P"+nx.PAD_NEUTRAL.hex()])

    def test_watchdog_releases_controller(self):
        sock = self.connect()
        sock.sendall(b"PAD 0400088080808000\n")
        self.assertEqual(self.line(sock), b"OK\n")
        sock.settimeout(5)
        self.assertEqual(self.line(sock), b"")
        self.assertEqual(self.reports(3)[-2:], [nx.RELEASE.hex(), "P"+nx.PAD_NEUTRAL.hex()])

    def test_real_tcp_macro_and_resume_preserve_message_order(self):
        lines = ['1/2"aA!', '2/2"bb`']
        self.leds_file.write_text("2")
        with nx.Client("127.0.0.1", self.port) as client, \
                mock.patch.object(nx, "wait_with_heartbeat"), contextlib.redirect_stdout(io.StringIO()):
            nx.send_civ(client, lines, start=2, preamble=False, countdown=0)
        records = self.reports(2+4+2*len(lines[1])+4+2)
        presses = [bytes.fromhex(x) for x in records if not x.startswith("P") and x != nx.RELEASE.hex()]
        expected = [nx.chord_report("ESC")]
        for char in lines[1]:
            mod, key = nx.character_key(char)
            if 4 <= key <= 29: mod ^= 2
            expected.append(nx.make_report(mod,[key]))
        expected += [nx.chord_report("ENTER")]*2
        self.assertEqual(presses, expected)
        self.assertEqual(records.count("P"+nx.pad_report("a").hex()), 1)


    def test_one_atomic_tap_releases_without_any_followup_packet(self):
        sock = self.connect()
        sock.sendall(b"TAP 40 40 0000250000000000\n")  # key 8
        # Simulate a client/Wi-Fi pause far beyond normal keyboard repeat delay.
        # No key-up command or further packet is sent during this pause.
        time.sleep(0.65)
        self.assertEqual(self.line(sock), b"OK\n")
        self.assertEqual(self.reports(2), ["0000250000000000", nx.RELEASE.hex()])
        events = [line.split() for line in (Path(self.temp.name) / "timings.txt").read_text().splitlines()]
        duration = int(events[1][0]) - int(events[0][0])
        self.assertGreaterEqual(duration, 40)
        self.assertLess(duration, 200)  # Release is local, well before the 650 ms pause ends.

    def test_packet_delay_between_identical_eights_keeps_separate_short_taps(self):
        sock = self.connect()
        for _ in range(2):
            sock.sendall(b"TAP 40 40 0000250000000000\n")
            self.assertEqual(self.line(sock), b"OK\n")
            time.sleep(0.35)
        self.assertEqual(self.reports(4), ["0000250000000000", nx.RELEASE.hex()] * 2)
        events = [line.split() for line in (Path(self.temp.name) / "timings.txt").read_text().splitlines()]
        self.assertLess(int(events[1][0]) - int(events[0][0]), 200)
        self.assertLess(int(events[3][0]) - int(events[2][0]), 200)

    def test_overlong_tap_is_rejected_before_pressing_a_key(self):
        sock = self.connect()
        sock.sendall(b"TAP 500 40 0000250000000000\n")
        self.assertEqual(self.line(sock), b"")
        self.assertEqual(self.reports(2), [nx.RELEASE.hex(), "P"+nx.PAD_NEUTRAL.hex()])

    def test_gamepad_tap_releases_without_a_second_packet(self):
        sock = self.connect()
        sock.sendall(b"PTAP 50 0 0400088080808000\n")
        self.assertEqual(self.line(sock), b"OK\n")
        self.assertEqual(self.reports(2), ["P"+nx.pad_report("A").hex(), "P"+nx.PAD_NEUTRAL.hex()])

    def test_atomic_text_prefix_and_repeated_characters_round_trip(self):
        with nx.Client("127.0.0.1", self.port) as client:
            nx.send_atomic_text(client, "9/87 8888", gap=0.04)
        expected = []
        for char in "9/87 8888":
            mod, key = nx.character_key(char)
            expected.extend([nx.make_report(mod,[key]).hex(), nx.RELEASE.hex()])
        self.assertEqual(self.reports(len(expected))[:len(expected)], expected)
