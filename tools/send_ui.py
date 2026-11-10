#!/usr/bin/env python3
"""Send the UI to an existing CivSwitch loader and keep its session open."""

import argparse
from pathlib import Path
import socket
import sys
from civswitch_sender import prepare_payload, upload_module

APP_DIR = Path(__file__).resolve().parents[1] / "app"
APP_SCRIPTS = (
    "vendor/forge-1.4.3.min.js",
    "src/storage/pairing-store.js",
    "src/storage/artwork-store.js",
    "src/storage/stream-settings.js",
    "src/platform/native-network.js",
    "src/protocol/sunshine-pairing.js",
    "src/protocol/sunshine-apps.js",
    "src/ui/game-artwork.js",
    "src/ui/hosts-screen.js",
    "src/ui/app-dialog.js",
    "src/ui/games-screen.js",
    "src/ui/settings-screen.js",
    "src/streaming/native-io.js",
    "src/streaming/telemetry.js",
    "src/streaming/png-preview.js",
    "src/streaming/native-texture.js",
    "src/streaming/native-media.js",
    "src/streaming/sunshine-session.js",
    "src/streaming/stream-client.js",
    "src/streaming/controller-input.js",
    "src/streaming/touch-input.js",
    "src/ui/stream-keyboard.js",
    "src/ui/stream-menu.js",
    "src/ui/stream-screen.js",
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
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("console_ip", help="Switch's local IP address")
    parser.add_argument("--port", type=int, default=9026)
    parser.add_argument("--clear-switch-data", action="store_true", help="Delete only this experiment's Switch directory (Sunshine client entry remains)")
    parser.add_argument("--no-streaming", action="store_true", help="Skip the streaming runtime upload for UI-only debugging (streaming is enabled by default)")
    args = parser.parse_args()
    try:
        payload = build_payload(args.clear_switch_data)
        streaming_source = None
        if not args.no_streaming and not args.clear_switch_data:
            artifact = APP_DIR.parent / "dist/runtime/moonlight-stream.js"
            if not artifact.is_file():
                parser.exit(1, "Streaming runtime is missing. Run npm run bootstrap and npm run build first, or use --no-streaming for UI-only debugging.\n")
            streaming_source = artifact.read_text()
    except (OSError, ValueError) as error:
        parser.exit(1, f"Cannot build payload: {error}\n")

    try:
        if streaming_source is not None:
            upload_module(args.console_ip, streaming_source, sys.stdout.buffer, port=args.port)
        payload = prepare_payload(args.console_ip, payload, sys.stdout.buffer, port=args.port)
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
    except (OSError, RuntimeError, ValueError) as error:
        parser.exit(1, f"Connection failed: {error}\n")


if __name__ == "__main__":
    main()
