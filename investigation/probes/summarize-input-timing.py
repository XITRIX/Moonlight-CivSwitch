#!/usr/bin/env python3
"""Summarize completed hardware runs; input timing is not button-to-display latency."""
import hashlib
import json
from pathlib import Path
import statistics

root = Path(__file__).resolve().parents[2]
evidence = root / 'investigation/evidence'
profiles = [
    ('baseline_30fps', 'input-baseline-valid-switch', 8),
    ('priority_30fps', 'input-priority-switch', 8),
    ('priority_60fps', 'input-priority-60fps-switch', 8),
    ('priority_continuous_60fps', 'input-priority-continuous-switch', 8),
    ('priority_continuous_30fps', 'input-priority-continuous-30fps-switch', 8),
    ('final_continuous_30fps', 'input-priority-10ms-30fps-switch', 10),
    ('final_continuous_60fps', 'input-priority-10ms-60fps-switch', 10),
]
summary = {'runs': {}, 'limits': [
    'Neutral controller packets, not physical button-to-display measurements.',
    'Sample-to-socket includes the local queue and encoding; socket-to-ACK includes client receive polling.',
    'A packet ACK does not measure the host game applying the input.',
    'Retransmissions are not a Wi-Fi packet-loss percentage.',
    'Sample-based timing is suppressed when updates coalesce and one-to-one correspondence is unavailable.',
    'Texture submissions are not display scanout; separate runs have different network conditions.',
]}
for label, basename, budget in profiles:
    source = evidence / (basename + '.txt')
    lines = source.read_text().splitlines()
    if not lines or lines[-1] != 'Executed successfully':
        raise SystemExit(f'Run incomplete: {source}')
    result = next(json.loads(line.split(': ', 1)[1]) for line in lines if line.startswith('MOONLIGHT_INPUT_RESULT: '))
    samples = [json.loads(line.split(': ', 1)[1]) for line in lines if line.startswith('MOONLIGHT_INPUT_STREAM: ')]
    metrics = {}
    for key in ['decodedFps', 'textureFps', 'loopHz', 'pumpAvgMs', 'drainAvgMs', 'decodeReadyMs', 'rttMs', 'rttVariationMs']:
        values = [sample[key] for sample in samples if sample.get(key) is not None]
        metrics[key] = {'median': round(statistics.median(values), 3), 'min': min(values), 'max': max(values)}
    summary['runs'][label] = {
        'source': source.name, 'pumpBudgetMs': budget, 'result': result,
        'samples': len(samples), 'metrics': metrics,
        'audioDiscardedPercent': round(result['audioDiscardedMs'] / (result['audioDecoded'] * 5) * 100, 3),
        'sampleMaxVideoFrameGaps': max(s['videoFrameGaps'] for s in samples),
        'sampleMaxDecoderRejected': max(s['decoderRejected'] for s in samples),
        'sampleMaxAudioFecFailures': max(s['audioFecFailed'] for s in samples),
    }
for label, name in [('baselineCoreSha256', 'moonlight-stream-input-baseline.js'), ('finalCoreSha256', 'moonlight-stream.js')]:
    artifact = root / 'dist/runtime' / name
    if artifact.exists():
        summary[label] = hashlib.sha256(artifact.read_bytes()).hexdigest()
output = evidence / 'input-latency-summary.json'
output.write_text(json.dumps(summary, indent=2) + '\n')
for label, run in summary['runs'].items():
    print(label, 'queue', run['result']['queueToSocketMs'], 'texture FPS', run['metrics']['textureFps']['median'], 'audio skipped %', run['audioDiscardedPercent'])
