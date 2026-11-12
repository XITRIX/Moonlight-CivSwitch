// The AV1 decoder-service session one stream decodes into, set up and torn down from the PC;
// the console loop that feeds it is av1-decode.js. Service path, order and tables: README.md, "AV1".
import probeTable from '../console-api/codec-probe-functions.json' with {type: 'json'};
import surfaceTable from '../console-api/codec-sample-functions.json' with {type: 'json'};
import streamTable from '../console-api/av1-stream-functions.json' with {type: 'json'};
import {emptyRequest, exchange, frameDimensions, memoryRequest, openRequest, serviceReply} from './codec-probe.js';
import {surfaceDescriptor} from './codec-sample.js';
import {sdkResolver} from './sdk.js';
import {replyInteger} from './protocol.js';
import {create as createMovieDecoder} from './decoder.js';

/** @import {Civ7Rpc, NativeValue} from './transport.js' */
/** @import {ProbeFunctions} from './codec-probe.js' */

const MIME = 'video/av1';
const REGISTRATION = 3;
const CONTROL_BYTES = 0x10000;
const INPUT_BYTES = 1024 * 1024;
const INPUT_BUFFERS = 2;
const SURFACES = 2;
const MIB = 1024 * 1024;
/** The workspace Codex's verified 720p frame decoded with; smaller table sizes are unproven. */
const PROVEN_TRANSFER_BYTES = 64 * MIB;
const CONTROL = {transferHandle: 0x90, mime: 0x200, sizing: 0x300, descriptor: 0x380, surfaces: 0x400};

/** What the user is told, once per console app, when a retired process refuses AV1. */
export const AV1_RESTART_NOTICE = 'Restart Moonlight on the console to use AV1 again';

/**
 * Console processes whose AV1 cleanup failed, by process session: they refuse another open.
 * @type {Map<string, {message: string, told: boolean}>}
 */
const retired = new Map();

/** @param {NativeValue} value */
const hex = value => '0x' + BigInt(value).toString(16);

/** @param {unknown} error */
const message = error => error instanceof Error ? error.message : String(error);

/**
 * The mode-1 AV1 workspace the native backend sizes for a frame: the first level of the table at
 * nnCompat +0x364a320 whose limits (+0x364a3e8) hold the frame, as the function at +0x2b9e600 does.
 * @param {number} width
 * @param {number} height
 */
export function workspaceBytes(width, height) {
  frameDimensions(width, height);
  const table = Buffer.from(streamTable.workspace.table.hex, 'hex');
  const limits = Buffer.from(streamTable.workspace.limits.hex, 'hex');
  const count = streamTable.workspace.levels;

  let index = 0;
  for (; index < count; index++) {
    const level = table.readUInt32LE(index * 4) - 1;
    const fits = width <= limits.readUInt32LE(level * 4) && height <= limits.readUInt32LE(36 + level * 4);
    if (fits) break;
  }
  const mebibytes = Number(table.readBigUInt64LE(0x28 + Math.min(index, count - 1) * 8));
  return mebibytes * MIB;
}

/** The largest workspace the level table names; the bridge lets only the AV1 workspace go above 128 MiB. */
export function workspaceLimit() {
  const table = Buffer.from(streamTable.workspace.table.hex, 'hex');
  const levels = Array.from({length: streamTable.workspace.levels}, (_, index) =>
    Number(table.readBigUInt64LE(0x28 + index * 8)));
  return Math.max(...levels) * MIB;
}

/** The transfer memory a stream registers: the native size, never below the proven 64 MiB. */
export function transferBytes(/** @type {number} */ width, /** @type {number} */ height) {
  return Math.max(workspaceBytes(width, height), PROVEN_TRANSFER_BYTES);
}

/** @param {bigint} header @param {number} [id] */
function packet(header, id) {
  const bytes = Buffer.alloc(64);
  bytes.writeBigUInt64LE(header);
  if (id !== undefined) bytes.writeUInt32LE(id, 8);
  return bytes;
}

/**
 * Checks the module build and every function, packet layout and table the AV1 path relies on.
 * @param {Civ7Rpc} rpc
 */
async function verifiedFunctions(rpc) {
  const module = await rpc.request({command: 'module-probe', name: 'nnCompat'});
  const known = [probeTable, surfaceTable, streamTable].every(table => table.moduleHash === module.hash);
  if (!known) throw Error('Unrecognized nnCompat build; AV1 needs the verified decoder service');
  const base = Number(replyInteger(module, 'base'));

  /** @type {Record<string, number>} */
  const functions = {};
  for (const [name, entry] of Object.entries({...probeTable.functions, ...surfaceTable.functions})) {
    functions[name] = base + entry.offset;
    await rpc.request({command: 'verify-function', address: functions[name], hex: entry.hex});
  }
  for (const entry of [...Object.values(probeTable.evidence), ...Object.values(streamTable.evidence)])
    await rpc.request({command: 'verify-function', address: base + entry.offset, hex: entry.hex});
  for (const entry of [streamTable.workspace.table, streamTable.workspace.limits]) {
    const bytes = await rpc.read(base + entry.offset, entry.hex.length / 2);
    if (bytes.toString('hex') !== entry.hex) throw Error('AV1 workspace table differs from the verified build');
  }
  functions.copy = await sdkResolver(rpc)('copy');
  return {base, functions};
}

/**
 * Opens an AV1 Main8 session for frames coded at `width` x `height`, with two registered output
 * surfaces of that size, and starts it. `display` is the size presented, the coded frame cropped.
 * A public movie decoder is held open meanwhile: it keeps the movie service up.
 * A failed cleanup retires the console process for AV1 until the app restarts.
 * @param {{rpc: Civ7Rpc, directory: string, width: number, height: number,
 *   display?: {width: number, height: number}, log?: (event: object) => void,
 *   createMovie?: (options: {rpc: Civ7Rpc, directory: string,
 *   log: (event: object) => void}) => Promise<{close(): Promise<unknown>}>}} options
 */
export async function createAv1Decoder({rpc, directory, width, height, display = {width, height},
  log = () => {}, createMovie = createMovieDecoder}) {
  frameDimensions(width, height);
  frameDimensions(display.width, display.height);
  if (display.width > width || display.height > height) throw Error('The AV1 display size exceeds the coded frame');
  const processKey = rpc.a.session;
  const earlier = retired.get(processKey);
  if (earlier) {
    const refusal = Error('AV1 cleanup failed earlier in this console app (' + earlier.message + '); restart the app');
    const firstRefusal = !earlier.told;
    earlier.told = true;
    throw firstRefusal ? Object.assign(refusal, {notice: AV1_RESTART_NOTICE}) : refusal;
  }

  const frameBytes = width * height * 3 / 2;
  // By the display size, as a title's max-width/max-height: 1082 or 1088 lines would take the
  // 2160p level (272 MiB) for a few padding lines.
  const workspace = transferBytes(display.width, display.height);
  /** @type {{close(): Promise<unknown>} | undefined} */
  let movie;
  /** @type {number[]} */
  const owned = [];
  /** @type {{record: number, id: number, backing: number}[]} */
  const surfaces = [];
  /** @type {number[]} */
  const inputs = [];
  const state = {control: 0, memory: 0, session: 0, transfer: 0, registered: false, started: false,
    uncertain: false, closed: false};
  /** @type {Record<string, number>} */
  let functions = {};
  let manager = 0;

  /**
   * One console call: uncertain from the request until its reply arrives, and after a transport
   * failure, which leaves the call's effect unknown.
   * @template T @param {string} stage @param {() => Promise<T>} operation
   */
  async function step(stage, operation) {
    state.uncertain = true;
    const result = await operation();
    state.uncertain = false;
    log({type: 'av1-decoder', stage});
    return result;
  }

  /** @param {number} bytes @param {number} [alignment] @param {'av1-workspace'} [purpose] */
  async function allocate(bytes, alignment = 0x1000, purpose = undefined) {
    const pointer = await rpc.allocate(bytes, {align: alignment, ...(purpose ? {purpose} : {})});
    owned.push(pointer);
    return pointer;
  }

  /** @param {string} name @param {NativeValue[]} args */
  async function native(name, args) {
    const {result} = await step(name, () => rpc.callAddress(functions[name], args));
    return Number(result & 0xffffffffn);
  }

  /** @param {string} stage @param {Buffer} request @param {number} handle @param {number} replyBytes */
  async function send(stage, request, handle, replyBytes) {
    const probeFunctions = /** @type {ProbeFunctions} */ (/** @type {unknown} */ (functions));
    const reply = await step(stage, () => exchange(rpc, probeFunctions, state.control, handle, request, replyBytes));
    if (reply.kernel) throw Error('AV1 ' + stage + ' kernel result ' + hex(reply.kernel));
    return reply.bytes;
  }

  /**
   * @param {string} stage @param {Buffer} request @param {bigint} expected
   * @param {{handle?: number, resultOffset?: number}} [options]
   */
  async function service(stage, request, expected, {handle = state.session, resultOffset = 8} = {}) {
    const bytes = await send(stage, request, handle, 128);
    const result = serviceReply(bytes.subarray(0, 64), expected, resultOffset);
    if (result) throw Error('AV1 ' + stage + ' was refused: service ' + hex(result));
    return bytes;
  }

  /** @param {number} index */
  async function createSurface(index) {
    const record = state.control + CONTROL.surfaces + index * 64;
    const sizing = await rpc.read(state.control + CONTROL.sizing, 16);
    const bytes = Number(sizing.readBigUInt64LE());
    const alignment = Number(sizing.readBigUInt64LE(8));
    const backing = await allocate(bytes, alignment);
    await rpc.write(record, Buffer.alloc(64));
    const created = await native('create', [record, backing, bytes, state.control + CONTROL.descriptor, 1]);
    if (created) throw Error('Cannot create an AV1 output surface: ' + hex(created));
    await rpc.resources?.register(backing, functions.destroy, [record]);

    const id = (await rpc.read(record + 4, 4)).readUInt32LE();
    const fields = Buffer.alloc(12);
    fields.writeUInt16LE(width);
    fields.writeUInt16LE(height, 2);
    fields.writeUInt32LE(1, 4);
    fields.writeUInt32LE(3, 8);
    await rpc.write(record + 32, fields);
    surfaces.push({record, id, backing});
  }

  /**
   * 327, once per surface and session; the console releases it after each frame (av1-decode.js).
   * @param {{record: number, id: number}} surface
   */
  async function registerSurface(surface) {
    const reply = await service('register-surface', packet(0x400000147n, surface.id), 0x900000147n);
    await rpc.write(surface.record + 48, reply.subarray(12, 28));
  }

  async function open() {
    const verified = await verifiedFunctions(rpc);
    functions = verified.functions;
    movie = await createMovie({rpc, directory, log});
    const slot = (await rpc.read(verified.base + probeTable.managerOffset, 8)).readBigUInt64LE();
    if (slot < 0x1000n || slot >= (1n << 39n) || slot % 4n) throw Error('The movie service is not initialized');
    manager = (await rpc.read(Number(slot), 4)).readUInt32LE();
    if (!manager) throw Error('The movie service has no session handle');

    state.control = await allocate(CONTROL_BYTES);
    await rpc.write(state.control, Buffer.alloc(0x1000));
    for (let index = 0; index < INPUT_BUFFERS; index++) inputs.push(await allocate(INPUT_BYTES));

    await rpc.write(state.control + CONTROL.descriptor, surfaceDescriptor(width, height));
    const sized = await native('sizing', [state.control + CONTROL.sizing, state.control + CONTROL.sizing + 8,
      state.control + CONTROL.descriptor, 1]);
    if (sized) throw Error('Cannot size the AV1 output surfaces: ' + hex(sized));
    const surfaceBytes = Number((await rpc.read(state.control + CONTROL.sizing, 8)).readBigUInt64LE());
    if (!Number.isSafeInteger(surfaceBytes) || surfaceBytes < frameBytes || surfaceBytes > 64 * MIB)
      throw Error('Unexpected AV1 surface size');
    for (let index = 0; index < SURFACES; index++) await createSurface(index);

    const acquired = await service('acquire', emptyRequest(0x11), 0x8000000100000011n, {handle: manager, resultOffset: 16});
    state.session = acquired.readUInt32LE(12);
    if (!state.session || state.session === manager) throw Error('Invalid AV1 decoder session');
    await rpc.resources?.register(state.control, functions.close, [state.session], 0);

    state.memory = await allocate(workspace, 0x1000, 'av1-workspace');
    const transfer = await native('transfer', [state.control + CONTROL.transferHandle, state.memory, workspace]);
    if (transfer) throw Error('Cannot create the AV1 transfer memory: ' + hex(transfer));
    state.transfer = (await rpc.read(state.control + CONTROL.transferHandle, 4)).readUInt32LE();
    if (!state.transfer) throw Error('Missing AV1 transfer-memory handle');
    await rpc.resources?.register(state.memory, functions.close, [state.transfer], 0);

    state.registered = true;
    await service('register-memory', memoryRequest(state.transfer, 'av1', REGISTRATION, workspace), 0x1000000d9n);
    await rpc.write(state.control + CONTROL.mime, Buffer.from(MIME + '\0'));
    await service('open', openRequest('av1', state.control + CONTROL.mime, {width, height}), 0x300000075n);
    for (const surface of surfaces) await registerSurface(surface);
    state.started = true;
    await service('start', packet(0x16n), 0x100000016n);
  }

  /** Stop 223, unregister 131, destroy surfaces, close handles, free memory, close the movie decoder. */
  async function teardown() {
    if (state.started) {
      await service('stop', packet(0xdfn), 0x1000000dfn);
      state.started = false;
    }
    if (state.registered) {
      await send('unregister-memory', emptyRequest(0x83), state.session, 64);
      state.registered = false;
    }
    for (const surface of [...surfaces].reverse()) await native('destroy', [surface.record]);
    surfaces.length = 0;
    for (const [stage, handle] of /** @type {[string, number][]} */ ([['close-session', state.session],
      ['close-transfer', state.transfer]])) {
      if (!handle) continue;
      const closed = await native('close', [handle]);
      if (closed) throw Error('AV1 ' + stage + ' failed: ' + hex(closed));
    }
    state.session = 0;
    state.transfer = 0;
    for (const pointer of [...owned].reverse()) await rpc.release(pointer);
    owned.length = 0;
    await movie?.close();
    movie = undefined;
  }

  /** Runs teardown once; an uncertain or failed one retires this console process for AV1. */
  async function close() {
    if (state.closed) return;
    state.closed = true;

    try {
      if (!rpc.connected || state.uncertain) throw Error('the console lost track of an AV1 call');
      await teardown();
      log({type: 'av1-decoder', stage: 'closed'});
    } catch (error) {
      retired.set(processKey, {message: message(error), told: false});
      log({type: 'av1-cleanup-failed', message: message(error),
        action: 'restart the console app before streaming AV1 again'});
      throw Error('AV1 cleanup failed (' + message(error) + '); restart the console app');
    }
  }

  try {
    await open();
  } catch (error) {
    log({type: 'av1-open-failed', message: message(error)});
    await close().catch(() => {});
    throw error;
  }

  return {
    dimensions: {width: display.width, height: display.height},
    nativeContext: {
      memory: state.control,
      functions: {},
      layout: {},
      av1: {
        functions: Object.fromEntries(['tls', 'send', 'copy', 'ready', 'readback']
          .map(name => [name, hex(functions[name])])),
        session: state.session, width, height, displayWidth: display.width, displayHeight: display.height,
        inputBytes: INPUT_BYTES,
        inputs: inputs.map(hex),
        surfaces: surfaces.map(surface => ({record: hex(surface.record), id: surface.id}))
      }
    },
    close
  };
}

/** For tests: forgets retired processes. */
export function resetRetired() {
  retired.clear();
}
