"""Specialize exact alignment-lowered i32 reads in the pinned wasm2js output.

DataView handles valid unaligned reads in the engine. Keep the original byte
semantics for invalid/partial ranges. Refresh the view alongside both generated
heap-view initializations, including memory growth. No stores are rewritten.
"""
import re


def specialize(source, symbol_text, expected_sites=378):
    names = {original: short for short, original in
             (line.split(':', 1) for line in symbol_text.splitlines() if ':' in line)}
    h, f64 = names['HEAPU8'], names['HEAPF64']
    helper, view = 'moonlight_load_i32', 'moonlight_load_view'
    if helper in source or view in source:
        raise ValueError('Load specialization was already applied')
    ident = r'[A-Za-z_$][A-Za-z0-9_$]*'
    arr = re.escape(h)
    pattern = re.compile(arr + r'\[(' + ident + r')(?:\+(\d+))?\|0\]\|' +
                         arr + r'\[\1\+(\d+)\|0\]<<8\|\(' +
                         arr + r'\[\1\+(\d+)\|0\]<<16\|' +
                         arr + r'\[\1\+(\d+)\|0\]<<24\)')
    count = 0

    def rewrite(match):
        nonlocal count
        offsets = [int(match[i] or 0) for i in range(2, 6)]
        if offsets != list(range(offsets[0], offsets[0] + 4)):
            return match[0]
        count += 1
        address = match[1] + ('+' + str(offsets[0]) if offsets[0] else '')
        return helper + '(' + address + '|0)'

    result = pattern.sub(rewrite, source)
    if count != expected_sites:
        raise ValueError(f'Unexpected lowered load shape: {count}, expected {expected_sites}')
    init = re.compile(r'(var )?' + re.escape(f64) + r'=new Float64Array\((' + ident + r')\);')
    matches = list(init.finditer(result))
    if len(matches) != 2 or not matches[0][1] or matches[1][1]:
        raise ValueError('Unexpected heap initialization/growth shape')
    result = init.sub(lambda m: m[0] + (m[1] or '') + view + '=new DataView(' + m[2] + ');', result)
    body = ('function ' + helper + '(p){if(p>=0&&p+4<=' + h + '.length)return ' +
            view + '.getInt32(p,true);return ' + h + '[p]|' + h + '[p+1|0]<<8|(' +
            h + '[p+2|0]<<16|' + h + '[p+3|0]<<24)}')
    marker = 'var ' + view + '='
    at = result.index(marker)
    return result[:at] + body + result[at:], count
