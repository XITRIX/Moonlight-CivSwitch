// Exercise generated upstream code with WebAssembly and Workers unavailable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomFillSync } = require('node:crypto');
const { performance } = require('node:perf_hooks');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, 'dist/moonlight-core.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'dist/manifest.json'), 'utf8'));
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, performance,
    WebAssembly: undefined, Worker: undefined, SharedWorker: undefined,
    window: {}, document: { currentScript: null },
  };
  vm.createContext(sandbox, { codeGeneration: { strings: true, wasm: false } });
  vm.runInContext(source, sandbox, { timeout: 10000, filename: 'moonlight-core.js' });
  const core = await sandbox.MoonlightCore({ moonlightPlatform: { randomFill: randomFillSync } });
  assert.equal(sandbox.WebAssembly, undefined);
  assert.equal(sandbox.Worker, undefined);
  for (const name of manifest.exports) assert.equal(typeof core[name], 'function', name);
  const results = {};
  for (const name of ['rtsp', 'fec', 'crypto', 'unaligned']) {
    const started = performance.now();
    const result = core[`_ml_test_${name}`]();
    assert.equal(result, 0, name);
    results[name] = { passed: true, elapsedMs: +(performance.now() - started).toFixed(2) };
  }
  const pointer = core._malloc(64);
  assert.ok(pointer);
  assert.equal(core._ml_random_probe(pointer, 64), 0);
  const random = core.HEAPU8.slice(pointer, pointer + 64);
  assert.ok(new Set(random).size > 8);
  core._free(pointer);
  const threads = core._ml_probe_threads();
  assert.notEqual(threads, 0, 'Stock non-pthread build must report unavailable threads');
  results.threadBackend = { available: false, error: threads };
  const missingEntropy = await sandbox.MoonlightCore();
  const target = missingEntropy._malloc(16);
  assert.equal(missingEntropy._ml_random_probe(target, 16), -1);
  missingEntropy._free(target);
  results.missingEntropyFailsClosed = true;
  results.upstreamExports = manifest.exports.filter(name => name.startsWith('_Li')).length;
  results.webAssemblyAvailable = false;
  const commonJSFactory = require('./dist/moonlight-core.js');
  const commonJSCore = await commonJSFactory({ moonlightPlatform: { randomFill: randomFillSync } });
  assert.equal(commonJSCore._ml_test_rtsp(), 0);
  results.commonJSFactory = true;
  console.log(JSON.stringify(results, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
