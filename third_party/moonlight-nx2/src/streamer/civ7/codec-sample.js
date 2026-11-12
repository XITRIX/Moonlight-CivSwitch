// One frame through the decoder service, with native NV12 surface readback.
import {setTimeout as delay} from 'node:timers/promises';
import definitions from '../console-api/codec-sample-functions.json' with {type: 'json'};
import {exchange, serviceReply, frameDimensions} from './codec-probe.js';
import {replyInteger} from './protocol.js';

/** @import {SampleContext, SampleProbe} from './codec-probe.js' */
/** @import {NativeValue} from './transport.js' */

const WIDTH = 128;
const HEIGHT = 96;
const PTS = 123456n;

/** @param {bigint} header */
function packet(header) {
  const bytes = Buffer.alloc(64);
  bytes.writeBigUInt64LE(header);
  return bytes;
}

/** @param {number} pointer @param {number} length @param {boolean} [endOfStream] */
export function inputRequest(pointer, length, endOfStream = false) {
  if (!Number.isSafeInteger(pointer) || pointer < 0x1000 || pointer >= 2 ** 39 ||
      !Number.isInteger(length) || length < 0 || length > 1024 * 1024 || (!length && !endOfStream))
    throw Error('Invalid sample input range');
  const bytes = packet(0x30010007dn);
  const address = BigInt(pointer);
  bytes.writeUInt32LE(length, 8);
  bytes.writeUInt32LE(Number(address & 0xffffffffn), 12);
  const high = ((address >> 4n) & 0xf0000000n) | ((address >> 34n) & 0x3fffffcn) |
    ((BigInt(length) >> 8n) & 0xf000000n);
  bytes.writeUInt32LE(Number(high), 16);
  bytes.writeBigUInt64LE(PTS, 20);
  bytes[28] = endOfStream ? 1 : 0;
  return bytes;
}

/** @param {number} [width] @param {number} [height] */
export function surfaceDescriptor(width = WIDTH, height = HEIGHT) {
  frameDimensions(width, height);
  const descriptor = Buffer.alloc(64);
  descriptor.writeBigUInt64LE(0x100000000n);
  descriptor.writeBigUInt64LE(BigInt((height - 1) * 65536 + width - 1), 8);
  return descriptor;
}

/**
 * @param {{data: Buffer, reference: Buffer, width?: number, height?: number, drain?: boolean,
 *   savePixels?: (pixels: Buffer) => Promise<void>}} options
 * @returns {SampleProbe}
 */
export function createSampleProbe({data, reference, width: frameWidth = WIDTH, height: frameHeight = HEIGHT,
  drain = false, savePixels = async () => {}}) {
  frameDimensions(frameWidth, frameHeight);
  const frameBytes = frameWidth * frameHeight * 3 / 2;
  if (!Buffer.isBuffer(data) || !data.length || data.length > 1024 * 1024)
    throw Error('Expected one encoded sample of at most 1 MiB');
  if (!Buffer.isBuffer(reference) || reference.length !== frameBytes)
    throw Error('Expected a ' + frameWidth + 'x' + frameHeight + ' NV12 reference');
  /** @type {SampleContext | undefined} */
  let context;
  /** @type {Record<string, number>} */
  const functions = {};
  /** @type {number[]} */
  const owned = [];
  /** @type {{record: number, id: number, fence: number}[]} */
  const surfaces = [];
  let started = false;

  /** @returns {SampleContext} */
  function active() {
    if (!context) throw Error('Sample probe is not initialized');
    return context;
  }

  /** @param {string} name @param {NativeValue[]} args @param {boolean} [check] */
  async function native(name, args, check = true) {
    const {rpc, step} = active();
    return step('sample-' + name, async () => {
      const code = Number((await rpc.callAddress(functions[name], args)).result & 0xffffffffn);
      if (check && code) throw Error(name + ' returned 0x' + code.toString(16));
      return {result: code, args: args.map(value => String(value))};
    });
  }

  /** @param {number} bytes @param {number} [alignment] */
  async function allocate(bytes, alignment = 0x1000) {
    const pointer = await active().rpc.allocate(bytes, {align: alignment});
    owned.push(pointer);
    return pointer;
  }

  /** @param {string} stage @param {Buffer} message @param {bigint} expected */
  async function request(stage, message, expected) {
    const ctx = active();
    return ctx.step('sample-' + stage, async () => {
      const {kernel, bytes} = await exchange(ctx.rpc, ctx.functions, ctx.scratch, ctx.session, message, 128);
      if (kernel) throw Error(stage + ' kernel result 0x' + kernel.toString(16));
      const service = serviceReply(bytes.subarray(0, 64), expected);
      return {service, response: bytes.toString('hex')};
    });
  }

  return {
    async run(ctx) {
      context = ctx;
      const {rpc, scratch} = ctx;
      const module = await rpc.request({command: 'module-probe', name: 'nnCompat'});
      if (module.hash !== definitions.moduleHash) throw Error('Unrecognized sample decoder build');
      const base = Number(replyInteger(module, 'base'));
      for (const [name, entry] of Object.entries(definitions.functions)) {
        functions[name] = base + entry.offset;
        await rpc.request({command: 'verify-function', address: functions[name], hex: entry.hex});
      }
      await rpc.write(scratch + 0x380, surfaceDescriptor(frameWidth, frameHeight));
      await native('sizing', [scratch + 0x300, scratch + 0x308, scratch + 0x380, 1]);
      const sizing = await rpc.read(scratch + 0x300, 16);
      const bytes = Number(sizing.readBigUInt64LE());
      const alignment = Number(sizing.readBigUInt64LE(8));
      if (!Number.isSafeInteger(bytes) || bytes < frameBytes || bytes > 64 * 1024 * 1024)
        throw Error('Unexpected sample surface size');
      for (let index = 0; index < 2; index++) {
        const record = scratch + 0x400 + index * 64;
        const backing = await allocate(bytes, alignment);
        await rpc.write(record, Buffer.alloc(64));
        await native('create', [record, backing, bytes, scratch + 0x380, 1]);
        const id = (await rpc.read(record + 4, 4)).readUInt32LE();
        surfaces.push({record, id, fence: record + 48});
        const fields = Buffer.alloc(12);
        fields.writeUInt16LE(frameWidth);
        fields.writeUInt16LE(frameHeight, 2);
        fields.writeUInt32LE(1, 4);
        fields.writeUInt32LE(3, 8);
        await rpc.write(record + 32, fields);
        const register = packet(0x400000147n);
        register.writeUInt32LE(id, 8);
        const result = await request('register-output', register, 0x900000147n);
        if (result.service) throw Error('Cannot register sample output: ' + result.service);
        await rpc.write(record + 48, Buffer.from(result.response, 'hex').subarray(12, 28));
      }
      const input = await allocate(data.length);
      const destination = await allocate(frameBytes);
      await rpc.write(input, data);
      await rpc.write(destination, Buffer.alloc(frameBytes, 0xa5));
      const start = await request('start', packet(0x16n), 0x100000016n);
      if (start.service) throw Error('Cannot start sample decoder: ' + start.service);
      started = true;
      const submitted = await request('input', inputRequest(input, data.length), 0x30000007dn);
      if (submitted.service) return {decoded: false, status: 'input-rejected', service: submitted.service};
      if (drain) {
        const ended = await request('drain', inputRequest(input, 0, true), 0x30000007dn);
        if (ended.service) return {decoded: false, status: 'drain-rejected', service: ended.service};
      }
      const deadline = Date.now() + 2000;
      let polls = 0;
      while (Date.now() < deadline && polls < 200) {
        let readySurface;
        for (const surface of surfaces) {
          const ready = await native('ready', [surface.fence], false);
          polls++;
          if (ready.result !== 0 && ready.result !== 1) throw Error('Unexpected sample fence result');
          if (ready.result === 1) {
            readySurface = surface;
            break;
          }
        }
        if (!readySurface) {
          await delay(10);
          continue;
        }
        const result = await request('output', packet(0xe5n), 0x11000000e5n);
        if (result.service) return {decoded: false, status: 'output-rejected', service: result.service, polls};
        const output = Buffer.from(result.response, 'hex');
        const id = output.readUInt32LE(12);
        const width = output.readUInt32LE(16);
        const height = output.readUInt32LE(20);
        const timestampNs = output.readBigUInt64LE(36);
        const flags = output[44];
        if ((flags & 1) && timestampNs === 0n)
          return {decoded: false, status: 'end-of-stream-without-frame', width, height,
            timestampNs: '0', flags, polls};
        const surface = surfaces.find(entry => entry.id === id);
        if (!surface || width !== frameWidth || height !== frameHeight || timestampNs !== PTS * 1000n)
          throw Error('Unexpected decoded sample metadata: ' + JSON.stringify({id, width, height,
            timestampNs: timestampNs.toString()}));
        if (surface !== readySurface) {
          const ready = await native('ready', [surface.fence], false);
          if (ready.result !== 1) throw Error('Output metadata arrived before its surface fence');
        }
        await native('readback', [surface.record, destination]);
        const pixels = await rpc.read(destination, frameBytes);
        await savePixels(pixels);
        let mismatches = 0;
        for (let offset = 0; offset < pixels.length; offset++)
          if (pixels[offset] !== reference[offset]) mismatches++;
        return {decoded: mismatches === 0, status: mismatches ? 'pixel-mismatch' : 'pixels-verified',
          width, height, timestamp: PTS.toString(), timestampNs: timestampNs.toString(),
          polls, mismatches, bytes: pixels.length};
      }
      return {decoded: false, status: 'output-timeout', polls, surfacesChecked: surfaces.length};
    },
    async stop() {
      if (!started) return;
      const stopped = await request('stop', packet(0xdfn), 0x1000000dfn);
      if (stopped.service) throw Error('Cannot stop sample decoder: ' + stopped.service);
      started = false;
    },
    async close() {
      if (!context) return;
      for (const surface of [...surfaces].reverse()) await native('destroy', [surface.record], false);
      for (const pointer of [...owned].reverse())
        await context.step('sample-free', async () => { await active().rpc.release(pointer); return {pointer}; });
    }
  };
}
