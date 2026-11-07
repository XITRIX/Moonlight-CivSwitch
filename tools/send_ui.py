#!/usr/bin/env python3
"""Send the UI to an existing CivSwitch loader and keep its session open."""

import argparse
from pathlib import Path
import socket
import sys

APP_DIR = Path(__file__).resolve().parents[1] / "app"
APP_SCRIPTS = (
    "vendor/forge-1.4.3.min.js",
    "src/storage/pairing-store.js",
    "src/platform/native-network.js",
    "src/protocol/sunshine-pairing.js",
    "src/protocol/sunshine-apps.js",
    "src/ui/games-screen.js",
    "src/ui/moonlight-ui.js",
)
CLEANUP_SCRIPTS = (
    "src/storage/pairing-store.js",
    "src/platform/native-network.js",
    "src/clear-switch-data.js",
)


def build_payload(clear_switch_data=False):
    scripts = CLEANUP_SCRIPTS if clear_switch_data else APP_SCRIPTS
    # Return the UI's lifetime promise from eval, keeping the loader alive.
    payload = b";\n".join((APP_DIR / name).read_bytes() for name in scripts)
    if len(payload) >= 500 * 1024:
        raise ValueError("Payload exceeds CivSwitch's 500 KiB limit.")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("console_ip", help="Switch's local IP address")
    parser.add_argument("--port", type=int, default=9026)
    parser.add_argument("--clear-switch-data", action="store_true", help="Delete only this experiment's Switch directory (Sunshine client entry remains)")
    args = parser.parse_args()
    try:
        payload = build_payload(args.clear_switch_data)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Cannot build payload: {error}\n")

    try:
        with socket.create_connection((args.console_ip, args.port), timeout=10) as connection:
            connection.settimeout(None)
            connection.sendall(payload)
            connection.shutdown(socket.SHUT_WR)
            print("Cleanup payload sent." if args.clear_switch_data else
                  "UI sent. Keep this terminal open; press B outside editing to close the UI.", flush=True)
            while True:
                chunk = connection.recv(4096)
                if not chunk:
                    break
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()
    except KeyboardInterrupt:
        print("\nSender stopped. Close the UI with B outside editing before sending again.")
    except OSError as error:
        parser.exit(1, f"Connection failed: {error}\n")


if __name__ == "__main__":
    main()
