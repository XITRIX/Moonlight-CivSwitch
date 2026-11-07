#!/usr/bin/env python3
"""Derive JS fixtures from this directory's generated Annex B streams."""
import json
from pathlib import Path
import re
import shutil
import subprocess

root = Path(__file__).resolve().parent

def nals(data):
    return [part for part in re.split(b'\x00\x00\x00?\x01', data)[1:] if part]

def parameter_sets(parts):
    return {key: next(n for n in parts if n[0] & 31 == kind).hex()
            for key, kind in [('sps', 7), ('pps', 8)]}

small = (root / 'sample-h264.annexb').read_bytes()
parts = nals(small)
fixture = parameter_sets(parts)
fixture['avcc2'] = b''.join(len(n).to_bytes(2, 'big') + n
                            for n in parts if n[0] & 31 not in (7, 8)).hex()
fixture['annexb'] = small.hex()
(root / 'h264-nals.js').write_text(
    '/* Generated 64x64 baseline H.264 fixture, raw SPS/PPS and 2-byte AVCC sample. */\n'
    'window.__moonlightH264=' + json.dumps(fixture) + ';\n')

parts = nals((root / 'sample-h264-720p.annexb').read_bytes())
frames, current = [], []
for nal in parts:
    if nal[0] & 31 == 9 and current:
        frames.append(b''.join(b'\x00\x00\x00\x01' + n for n in current))
        current = []
    current.append(nal)
if current:
    frames.append(b''.join(b'\x00\x00\x00\x01' + n for n in current))
assert len(frames) == 30, f'Expected 30 access units, got {len(frames)}'
fixture = parameter_sets(parts)
fixture['packets'] = [frame.hex() for frame in frames]
(root / 'h264-sequence.js').write_text(
    '/* Generated 720p30 blue H.264 sequence with AUD-separated access units. */\n'
    'window.__moonlightH264Sequence=' + json.dumps(fixture) + ';\n')

motion = root / 'sample-h264-motion-720p.annexb'
if motion.exists():
    parts = nals(motion.read_bytes())
    frames, current = [], []
    for nal in parts:
        if nal[0] & 31 == 9 and current:
            frames.append(b''.join(b'\x00\x00\x00\x01' + n for n in current))
            current = []
        current.append(nal)
    if current:
        frames.append(b''.join(b'\x00\x00\x00\x01' + n for n in current))
    assert len(frames) == 30
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('FFmpeg is needed to derive motion reference pixels')
    reference = subprocess.run(
        [ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(motion),
         '-pix_fmt', 'nv12', '-f', 'rawvideo', 'pipe:1'],
        check=True, capture_output=True).stdout
    frame_bytes = 1280 * 720 * 3 // 2
    assert len(reference) == len(frames) * frame_bytes
    points = [(32 + (i * 173) % 1216, 32 + (i * 97) % 656) for i in range(24)]
    expected = []
    for i in range(len(frames)):
        raw = reference[i * frame_bytes:(i + 1) * frame_bytes]
        expected.append([[x, y, raw[y * 1280 + x],
                          raw[1280 * 720 + (y // 2) * 1280 + (x & ~1)],
                          raw[1280 * 720 + (y // 2) * 1280 + (x & ~1) + 1]]
                         for x, y in points])
    fixture = parameter_sets(parts)
    fixture.update(packets=[f.hex() for f in frames], expected=expected)
    (root / 'h264-motion-sequence.js').write_text(
        '/* Generated moving 720p30 H.264 with FFmpeg NV12 reference samples. */\n'
        'window.__moonlightH264Sequence=' + json.dumps(fixture) + ';\n')
