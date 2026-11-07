"""Bound log messages for CivSwitch's fixed 2048-byte native log buffer."""
import json

PART_PREFIX = 'MOONLIGHT_PROBE_LOG_PART: '


def wrap_payload(source):
    # Worst case: 256 UTF-16 units escaped as six ASCII bytes each, plus envelope.
    # Keep eval direct so the loader's native primitives remain in lexical scope.
    return ('''(async function () {
 const moonlightProbeOriginalLog = window.log;
 window.log = async function (message) {
  const value = String(message);
  if (value.length <= 256) return moonlightProbeOriginalLog(value);
  for (let offset = 0; offset < value.length; offset += 256)
   await moonlightProbeOriginalLog("MOONLIGHT_PROBE_LOG_PART: " + JSON.stringify({
    text: value.slice(offset, offset + 256), last: offset + 256 >= value.length
   }));
 };
 try { return await eval(''' + json.dumps(source) + '''); }
 finally { window.log = moonlightProbeOriginalLog; }
})();''').encode()


class LogDecoder:
    def __init__(self):
        self.pending = b''
        self.parts = []

    def feed(self, chunk):
        self.pending += chunk
        lines = []
        while b'\n' in self.pending:
            raw, self.pending = self.pending.split(b'\n', 1)
            line = raw.decode('utf-8')
            if line.startswith(PART_PREFIX):
                item = json.loads(line[len(PART_PREFIX):])
                self.parts.append(item['text'])
                if item['last']:
                    lines.append(''.join(self.parts).encode('utf-16', 'surrogatepass').decode('utf-16'))
                    self.parts.clear()
            else:
                if self.parts:
                    raise ValueError('Incomplete chunked probe log')
                lines.append(line)
        return lines

    def finish(self):
        if self.pending or self.parts:
            raise ValueError('Truncated probe log')
