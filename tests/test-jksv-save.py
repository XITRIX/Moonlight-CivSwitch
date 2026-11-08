import importlib.util
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location(
    "build_jksv_save", Path(__file__).resolve().parents[1] / "tools/build_jksv_save.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class SavePatchTests(unittest.TestCase):
    def template(self):
        data = bytearray(b"CIV7" + b"\xAB" * 4092)
        record = (bytes.fromhex("fe5a61e8") + struct.pack("<QII", 2, 0x60000009, 1)
                  + b"4000 BCE\0")
        data[128:128 + len(record)] = record
        return bytes(data)

    def test_splice_preserves_other_records_and_updates_length(self):
        template = self.template()
        value = b"<img src=x>" + b"XSSP:0:0123456789" * 1000
        result = builder.patch_save(template, value)
        self.assertEqual(result[:140], template[:140])
        self.assertEqual(struct.unpack_from("<II", result, 140),
                         (0x60000000 | (len(value) + 1), 1))
        self.assertEqual(result[148:148 + len(value) + 1], value + b"\0")
        self.assertEqual(result[148 + len(value) + 1:], template[157:])
        self.assertEqual(len(result), len(template) + len(value) - 8)

    def test_rejects_wrong_magic(self):
        with self.assertRaisesRegex(ValueError, "Invalid CIV7"):
            builder.patch_save(b"WRNG" + self.template()[4:], b"x")

    def test_rejects_missing_or_duplicate_record(self):
        template = self.template()
        for data in (template.replace(bytes.fromhex("fe5a61e8"), b"NONE"),
                     template + template[128:157] + b"\0" * 32):
            with self.assertRaisesRegex(ValueError, "exactly one"):
                builder.patch_save(data, b"x")

    def test_rejects_unexpected_original_value(self):
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            builder.patch_save(self.template().replace(b"4000 BCE", b"3000 BCE"), b"x")

    def test_rejects_embedded_nul(self):
        with self.assertRaisesRegex(ValueError, "Invalid replacement"):
            builder.patch_save(self.template(), b"x\0y")


if __name__ == "__main__":
    unittest.main()
