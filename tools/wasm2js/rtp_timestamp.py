"""Specialize bounded RTP arithmetic after the pinned wasm2js compilation.

uint32 timestamps * 1000 fit exactly below 2**42. Their quotient by 90 is below
2**36, whose floating spacing is far smaller than the minimum 1/90 remainder.
Thus floor(double(timestamp) * 1000 / 90) is the exact integer quotient.
Leave every general-purpose i64 operation, including crypto, unchanged.
"""
import re


def specialize(source, symbol_text):
    names = {original: short for short, original in
             (line.split(':', 1) for line in symbol_text.splitlines() if ':' in line)}
    mul, divide, high, floor = [names[key] for key in
                              ['__wasm_i64_mul', '__wasm_i64_udiv', 'i64toi32_i32$HIGH_BITS', 'Math_floor']]
    identifier = r'[A-Za-z_$][A-Za-z0-9_$]*'
    pattern = re.compile(re.escape(divide) + r'\(' + re.escape(mul) +
                         r'\((' + identifier + r'),0,(?:1e3|1000),0\),' + re.escape(high) + r',90\)')
    helper = 'moonlight_rtp_timestamp_us'
    if helper in source:
        raise ValueError('RTP specialization was already applied')
    # Two upstream inlined packet paths plus our actual-artifact diagnostic.
    optimized, count = pattern.subn(lambda m: helper + '(' + m[1] + ')', source)
    if count != 3:
        raise ValueError(f'Unexpected wasm2js RTP arithmetic shape: {count} sites, expected 3')
    marker = 'function ' + divide + '('
    if optimized.count(marker) != 1:
        raise ValueError('Cannot locate the original division helper')
    body = ('function ' + helper + '(t){var q=' + floor + '((t>>>0)*1000/90);' +
            high + '=q/4294967296|0;return q|0}')
    return optimized.replace(marker, body + marker), count
