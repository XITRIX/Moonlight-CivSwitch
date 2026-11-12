// Isolated decoder-service opens using the captured TIPC ABI. No codec is enabled for streaming.
import definitions from '../console-api/codec-probe-functions.json' with {type: 'json'};
import {sdkResolver} from './sdk.js';
import {planReply} from './call-plan.js';
import {replyInteger} from './protocol.js';

/** @import {Civ7Rpc} from './transport.js' */

const MIME = {h264: 'video/avc', hevc: 'video/hevc', av1: 'video/av1', vp8: 'video/vp8', vp9: 'video/vp9'};
const REGISTRATION = {h264: 0, hevc: 0, av1: 3, vp8: 4, vp9: 1};
const TRANSFER_BYTES = 64 * 1024 * 1024;
const REPLY_MASK = 0x800003ffffffffffn;
const hex = (/** @type {number | bigint} */ value) => '0x' + BigInt(value).toString(16);

/** Up to 3840x2160, the largest AV1 workspace level; H.264 keeps 1080p (native-decoder.js). */
export const MAX_FRAME = {width: 3840, height: 2160};

/** @param {number} width @param {number} height */
export function frameDimensions(width, height) {
  const integers = Number.isInteger(width) && Number.isInteger(height);
  const bounded = width >= 2 && width <= MAX_FRAME.width && height >= 2 && height <= MAX_FRAME.height;
  if (!integers || !bounded || width % 2 || height % 2) throw Error('Invalid codec probe dimensions');
  return {width, height};
}

/** @param {string} codec @param {number} width @param {number} height */
export function probeDimensions(codec, width, height) {
  const size = frameDimensions(width, height);
  if ((codec === 'vp8' || codec === 'vp9') && (width > 1280 || height > 720))
    throw Error('VP8 and VP9 probes support at most 1280x720 with the reserved workspace');
  return size;
}

/** @param {string} codec @param {number} mimeAddress @param {{width?: number, height?: number}} [size] */
export function openRequest(codec, mimeAddress, {width = 128, height = 96} = {}) {
  probeDimensions(codec, width, height);
  if (!Object.hasOwn(MIME, codec)) throw Error('Expected codec h264, hevc, av1, vp8 or vp9');
  const pointer = BigInt(mimeAddress);
  if (!Number.isSafeInteger(mimeAddress) || pointer < 0x1000n || pointer >= (1n << 39n))
    throw Error('Invalid MIME address');
  const mime = MIME[/** @type {keyof typeof MIME} */ (codec)];
  const bytes = Buffer.alloc(64);
  bytes.writeBigUInt64LE(0x800100075n);
  bytes.writeUInt32LE(Buffer.byteLength(mime) + 1, 8);
  bytes.writeUInt32LE(Number(pointer & 0xffffffffn), 12);
  const high = ((pointer >> 4n) & 0xf0000000n) | ((pointer >> 34n) & 0x3ffffffcn);
  bytes.writeUInt32LE(Number(high), 16);
  bytes.writeUInt16LE(width, 20);
  bytes.writeUInt16LE(height, 24);
  bytes.writeUInt32LE(60, 28);
  bytes.writeUInt32LE(1024 * 1024, 32);
  return bytes;
}

/** @param {string} codec @param {number | undefined} registration */
function registrationType(codec, registration) {
  if (!Object.hasOwn(MIME, codec)) throw Error('Expected codec h264, hevc, av1, vp8 or vp9');
  const expected = REGISTRATION[/** @type {keyof typeof REGISTRATION} */ (codec)];
  const value = registration ?? expected;
  if (value !== expected && !(codec === 'hevc' && value === 2)) throw Error('Invalid codec registration');
  return value;
}

/**
 * @param {number} transferHandle @param {string} codec @param {number} [registration]
 * @param {number} [transferBytes] the workspace the transfer memory holds
 */
export function memoryRequest(transferHandle, codec, registration, transferBytes = TRANSFER_BYTES) {
  const type = registrationType(codec, registration);
  if (!Number.isInteger(transferHandle) || transferHandle < 1 || transferHandle > 0xffffffff)
    throw Error('Invalid transfer handle');
  if (!Number.isSafeInteger(transferBytes) || transferBytes < 0x1000 || transferBytes % 0x1000)
    throw Error('Invalid transfer-memory size');
  const bytes = Buffer.alloc(64);
  bytes.writeBigUInt64LE(0x80000006000000d9n);
  bytes.writeUInt32LE(2, 8);
  bytes.writeUInt32LE(transferHandle, 12);
  bytes.writeBigUInt64LE(BigInt(transferBytes), 16);
  bytes.writeUInt32LE(type, 24);
  bytes.writeUInt32LE(1, 28);
  bytes.writeUInt32LE(3, 32);
  bytes.writeUInt32LE(1, 36);
  return bytes;
}

/** @param {number} command */
export function emptyRequest(command) {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32LE(command);
  return bytes;
}

/** @param {Buffer} bytes @param {bigint} expected @param {number} resultOffset */
export function serviceReply(bytes, expected, resultOffset = 8) {
  if (bytes.length !== 64 || (bytes.readBigUInt64LE() & REPLY_MASK) !== expected)
    throw Error('Unexpected decoder-service reply');
  if (resultOffset === 16 && bytes.readUInt32LE(8) !== 0x20)
    throw Error('Decoder-service reply did not return one moved handle');
  return bytes.readUInt32LE(resultOffset);
}

/** @typedef {{tls: number, send: number, close: number, transfer: number, copy: number}} ProbeFunctions */
/**
 * @typedef {{rpc: Civ7Rpc, functions: ProbeFunctions, scratch: number, session: number,
 *   step: <T>(stage: string, operation: () => Promise<T>) => Promise<T>}} SampleContext
 */
/**
 * @typedef {{run(context: SampleContext): Promise<{decoded: boolean, [key: string]: unknown}>,
 *   stop(): Promise<void>, close(): Promise<void>}} SampleProbe
 */

/**
 * @param {Pick<Civ7Rpc, 'callPlan' | 'write'>} rpc
 * @param {ProbeFunctions} functions
 * @param {number} scratch
 * @param {number} handle
 * @param {Buffer} message
 * @param {number} [replyBytes]
 */
export async function exchange(rpc, functions, scratch, handle, message, replyBytes = 64) {
  if (message.length !== 64) throw Error('Invalid decoder-service message');
  if (replyBytes !== 64 && replyBytes !== 128) throw Error('Invalid decoder-service reply length');
  await rpc.write(scratch, message);
  const tls = hex(scratch + 0x80);
  const reply = planReply(await rpc.callPlan({steps: [
    {call: hex(functions.tls), args: [], store: tls},
    {check: {u64: tls}, min: 0x1000, below: hex(1n << 39n), message: 'Invalid thread-local buffer'},
    {call: hex(functions.copy), args: [{u64: tls}, scratch, 64]},
    {call: hex(functions.send), args: [handle]},
    {call: hex(functions.copy), args: [scratch + 0x100, {u64: tls}, replyBytes]}
  ], read: [{address: hex(scratch + 0x100), length: replyBytes}]}));
  if (reply.error || reply.calls.length !== 4 || reply.memory.length !== 1)
    throw Error('Incomplete decoder-service call plan');
  const kernel = Number(BigInt(reply.calls[2].result) & 0xffffffffn);
  const bytes = Buffer.from(reply.memory[0], 'hex');
  if (bytes.length !== replyBytes) throw Error('Incomplete decoder-service reply');
  return {kernel, bytes};
}

/**
 * @param {Civ7Rpc} rpc
 * @param {{codec: string, log?: (event: object) => Promise<void>, sample?: SampleProbe,
 *   width?: number, height?: number, registration?: number}} options
 */
export async function probeCodec(rpc, {codec, log = async () => {}, sample, width = 128, height = 96,
  registration}) {
  probeDimensions(codec, width, height);
  const type = registrationType(codec, registration);
  if (!Object.hasOwn(MIME, codec)) throw Error('Expected codec h264, hevc, av1, vp8 or vp9');
  const module = await rpc.request({command: 'module-probe', name: 'nnCompat'});
  if (module.hash !== definitions.moduleHash) throw Error('Unrecognized nnCompat decoder build');
  const base = Number(replyInteger(module, 'base'));
  /** @type {ProbeFunctions} */
  const functions = {tls: 0, send: 0, close: 0, transfer: 0, copy: 0};
  for (const [name, definition] of Object.entries(definitions.functions)) {
    const address = base + definition.offset;
    await rpc.request({command: 'verify-function', address, hex: definition.hex});
    functions[/** @type {keyof typeof definitions.functions} */ (name)] = address;
  }
  for (const definition of Object.values(definitions.evidence))
    await rpc.request({command: 'verify-function', address: base + definition.offset, hex: definition.hex});
  functions.copy = await sdkResolver(rpc)('copy');

  const slot = (await rpc.read(base + definitions.managerOffset, 8)).readBigUInt64LE();
  await log({event: 'decoder-service-manager', base: hex(base), slot: hex(slot)});
  if (slot < 0x1000n || slot >= (1n << 39n) || slot % 4n)
    throw Error('Movie service is not initialized; run an H.264 stream in this app process first');
  const manager = (await rpc.read(Number(slot), 4)).readUInt32LE();
  if (!manager) throw Error('Movie service has no session handle');

  const scratch = await rpc.allocate(0x1000);
  let memory = 0;
  let session = 0;
  let transfer = 0;
  let registered = false;
  let uncertain = false;
  /** @type {unknown} */
  let cleanupError = null;
  /** @type {{codec: string, registration: number, accepted: boolean, kernel: number, service: number | null, decoded: boolean,
   *   sample?: object}} */
  const outcome = {codec, registration: type, accepted: false, kernel: 0, service: 0, decoded: false};

  /** @template T @param {string} stage @param {() => Promise<T>} operation */
  async function step(stage, operation) {
    await log({event: 'codec-probe-before', stage, codec, session, transfer, scratch, memory});
    uncertain = true;
    let result;
    try {
      result = await operation();
    } catch (error) {
      await log({event: 'codec-probe-after', stage, codec,
        error: error instanceof Error ? error.message : String(error)});
      throw error;
    }
    uncertain = false;
    await log({event: 'codec-probe-after', stage, codec, result});
    return result;
  }

  /** @param {string} stage @param {Buffer} message @param {bigint} expected @param {number} [resultOffset] */
  async function request(stage, message, expected, resultOffset = 8) {
    return step(stage, async () => {
      const {kernel, bytes} = await exchange(rpc, functions, scratch, session || manager, message);
      const service = kernel === 0 ? serviceReply(bytes, expected, resultOffset) : null;
      if (stage === 'acquire' && kernel === 0 && service === 0) {
        session = bytes.readUInt32LE(12);
        if (!session || session === manager) throw Error('Invalid dedicated decoder session');
      }
      return {kernel, service, response: bytes.toString('hex')};
    });
  }

  try {
    await rpc.write(scratch, Buffer.alloc(0x1000));
    const acquired = await request('acquire', emptyRequest(0x11), 0x8000000100000011n, 16);
    if (acquired.kernel || acquired.service) throw Error('Cannot acquire a decoder session');
    memory = await rpc.allocate(TRANSFER_BYTES);
    await step('transfer-memory', async () => {
      const {result} = await rpc.callAddress(functions.transfer, [scratch + 0x90, memory, TRANSFER_BYTES]);
      const code = Number(result & 0xffffffffn);
      if (code) throw Error('CreateTransferMemory returned ' + hex(code));
      transfer = (await rpc.read(scratch + 0x90, 4)).readUInt32LE();
      if (!transfer) throw Error('Missing transfer-memory handle');
      return {result: code, transfer};
    });
    registered = true;
    const setup = await request('register-memory', memoryRequest(transfer, codec, type), 0x1000000d9n);
    if (setup.kernel || setup.service) throw Error('Decoder memory registration failed');
    const mimeAddress = scratch + 0x200;
    await rpc.write(mimeAddress, Buffer.from(MIME[/** @type {keyof typeof MIME} */ (codec)] + '\0'));
    const opened = await request('open', openRequest(codec, mimeAddress, {width, height}), 0x300000075n);
    outcome.kernel = opened.kernel;
    outcome.service = opened.service;
    outcome.accepted = opened.kernel === 0 && opened.service === 0;
    if (outcome.accepted && sample) {
      const result = await sample.run({rpc, functions, scratch, session, step});
      outcome.sample = result;
      outcome.decoded = result.decoded;
    }
    return outcome;
  } finally {
    try {
      if (!rpc.connected || uncertain) throw Error('Probe outcome uncertain; restart the console app before another probe');
      await sample?.stop();
      if (registered) {
        const released = await request('unregister-memory', emptyRequest(0x83), 0x83n);
        if (released.kernel) throw Error('Cannot release decoder memory');
      }
      await sample?.close();
      for (const {stage, handle} of [{stage: 'close-session', handle: session},
        {stage: 'close-transfer', handle: transfer}]) {
        if (!handle) continue;
        await step(stage, async () => {
          const {result} = await rpc.callAddress(functions.close, [handle]);
          if ((result & 0xffffffffn) !== 0n) throw Error('CloseHandle failed');
          return {result: 0};
        });
      }
      if (memory) await rpc.release(memory);
      await rpc.release(scratch);
    } catch (error) {
      cleanupError = error;
    }
    if (cleanupError) {
      rpc.disconnect(Error('Decoder probe cleanup incomplete; restart the console app'));
      throw cleanupError;
    }
  }
}
