#!/usr/bin/env python3
"""Build CivSwitch's persistent loader save offline for import through JKSV.

Uses the local upstream template and compressor without running its installer.
Optionally copies an unpacked JKSV backup, preserving its metadata and files.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "investigation/references/CivSwitch"
INSTALLER = UPSTREAM / "installer-creator"
SAVE_PATH = Path("saves/Single/XSTRIG.Civ7Save")


def patch_save(template, value):
    """Reproduce install.py's currentTurnDate splice, preserving other bytes."""
    if len(template) < 4096 or template[:4] != b"CIV7":
        raise ValueError("Invalid CIV7 save template")
    matches = []
    for pos in range(len(template) - 28):
        if template[pos:pos + 4] != bytes.fromhex("fe5a61e8"):
            continue
        framing, flag = struct.unpack_from("<II", template, pos + 12)
        if framing & 0xE0000000 == 0x60000000 and flag == 1:
            matches.append((pos, (framing & 0x1FFFFFFF) - 1))
    if len(matches) != 1:
        raise ValueError("Expected exactly one currentTurnDate record")
    pos, old_length = matches[0]
    start = pos + 20
    tail = start + old_length + 1
    if template[start:tail] != b"4000 BCE\0":
        raise ValueError("Unexpected currentTurnDate value")
    if b"\0" in value or len(value) + 1 > 0x1FFFFFFF:
        raise ValueError("Invalid replacement value")
    result = (template[:pos + 12]
              + struct.pack("<II", 0x60000000 | (len(value) + 1), 1)
              + value + b"\0" + template[tail:])
    assert result[:pos + 12] == template[:pos + 12]
    assert result[start + len(value) + 1:] == template[tail:]
    assert len(result) == len(template) + len(value) - old_length
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-dir", type=Path,
                        help="Existing unpacked JKSV backup to copy; left unchanged")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "dist/jksv/CivSwitch-loader",
                        help="New output folder (must not already exist)")
    args = parser.parse_args()
    output = args.output.resolve()
    archive = output.with_suffix(".zip")
    if output.exists() or archive.exists():
        parser.error("Output folder or ZIP already exists; choose a new --output")
    if args.backup_dir and not args.backup_dir.is_dir():
        parser.error("--backup-dir must be an unpacked JKSV backup directory")
    if args.backup_dir and args.backup_dir.resolve() in output.parents:
        parser.error("Output must be outside the source backup")
    try:
        # Read the upstream stager constant; main() is guarded, so no network or
        # on-console filesystem operations in install.py are executed.
        spec = importlib.util.spec_from_file_location("civswitch_installer", INSTALLER / "install.py")
        installer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(installer)
        source = (UPSTREAM / "core.js").read_text(encoding="utf-8")
        wrapped = ("(async function() {\ntry{\n" + source
                   + "\n} catch (e) {\nawait log('EXCEPTION: ' + e.message);\n"
                   + "await log(e.stack);\n}\n})();")
        with tempfile.TemporaryDirectory(prefix="civswitch-jksv-") as tmp:
            temp = Path(tmp)
            (temp / "wrapped.js").write_text(wrapped, encoding="utf-8")
            subprocess.run(["node", str(INSTALLER / "compress_stage.js"),
                            str(temp / "wrapped.js"), str(temp / "stage.hex")], check=True)
            stage_hex = (temp / "stage.hex").read_text().strip()
        bytes.fromhex(stage_hex)  # Validate before including it in the record.
        value = (installer.STAGER + "XSSP:0:" + stage_hex).encode("ascii")
        template = (INSTALLER / "save_template.bin").read_bytes()
        save = patch_save(template, value)
        if args.backup_dir:
            shutil.copytree(args.backup_dir, output)
        else:
            output.mkdir(parents=True)
        destination = output / SAVE_PATH
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(save)
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            for path in sorted(output.rglob("*")):
                if path.is_file():
                    bundle.write(path, path.relative_to(output).as_posix())
        report = {
            "save": str(destination), "bytes": len(save),
            "sha256": hashlib.sha256(save).hexdigest(),
            "template_sha256": hashlib.sha256(template).hexdigest(),
            "core_sha256": hashlib.sha256((UPSTREAM / "core.js").read_bytes()).hexdigest(),
            "archive": str(archive),
            "includes_user_backup": bool(args.backup_dir),
        }
        output.with_suffix(".manifest.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        if not args.backup_dir:
            print("Overlay only: merge saves/ into a COPY of your JKSV backup before restoring.")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Build failed: {error}\n")


if __name__ == "__main__":
    main()
