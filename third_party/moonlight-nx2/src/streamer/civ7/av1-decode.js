// AV1 through the console's decoder service: submit a temporal unit, wait for the oldest surface's
// fence, untile it into the destination and release it back with 330. Shipped by toString();
// decodeBatch calls it in place of movie::Decoder; av1-decoder.js sets it up (README.md, "AV1").

/** @import {ConsoleNative, ConsoleRequest} from './console-runtime.js' */
/** @import {DecodeUnit} from './decode-batch.js' */

/**
 * @typedef {Pick<ConsoleNative, 'address' | 'integer' | 'checkMemory' | 'verified' | 'call' | 'read64' |
 *   'write64'> & {pump?: () => void, now?: () => number}} Av1Native
 */

/**
 * @typedef {{submit(unit: DecodeUnit): void, wait(until?: () => boolean): boolean,
 *   output(target?: bigint): string, frameBytes: number, format: {stride: number, sliceHeight: number},
 *   report(): {frames: number, steps: string[]}}} Av1Backend
 */

/**
 * @param {Av1Native} native
 * @param {ConsoleRequest} request the video-stream request's `av1` block
 * @param {{memory: bigint, destination: bigint, destinationBytes: number}} context
 * @returns {Av1Backend}
 */
export function createAv1Backend(native, request, context) {
  const {address, integer, checkMemory, verified, call, read64, write64} = native;
  const named = /** @type {Record<string, unknown>} */ (request.functions);
  /** @type {Record<string, bigint>} */
  const functions = {};
  for (const name of ['tls', 'send', 'copy', 'ready', 'readback']) {
    const pointer = address(named[name]);
    if (!verified.has('0x' + pointer.toString(16))) throw Error('Unverified AV1 function: ' + name);
    functions[name] = pointer;
  }

  const session = BigInt(integer(request.session, 1, 0xffffffff));
  const width = integer(request.width, 2, 3840);
  const height = integer(request.height, 2, 2160);
  const displayWidth = integer(request.displayWidth ?? width, 2, width);
  const displayHeight = integer(request.displayHeight ?? height, 2, height);
  const frameBytes = width * height * 3 / 2;
  if (width % 2 || height % 2 || frameBytes > context.destinationBytes)
    throw Error('AV1 frame does not fit the destination');

  const inputBytes = integer(request.inputBytes, 0x1000, 1024 * 1024);
  const listedInputs = Array.isArray(request.inputs) ? request.inputs : [];
  if (listedInputs.length < 1 || listedInputs.length > 4) throw Error('Invalid AV1 input buffers');
  const inputs = listedInputs.map(value => {
    const pointer = address(value);
    checkMemory(pointer, inputBytes, 3);
    return pointer;
  });

  const listedSurfaces = Array.isArray(request.surfaces) ? request.surfaces : [];
  if (listedSurfaces.length < 2 || listedSurfaces.length > 8) throw Error('Invalid AV1 surfaces');
  const surfaces = listedSurfaces.map((/** @type {ConsoleRequest} */ entry) => {
    const record = address(entry.record);
    checkMemory(record, 64, 3);
    return {record, fence: record + 48n, id: integer(entry.id, 1, 0xffffffff)};
  });

  const staging = context.memory;
  const staged = Array(8).fill(-1n);
  checkMemory(staging, 0x200, 3);
  let tls = 0n;
  const reply = staging + 0x100n;
  /** @type {bigint[]} */
  const pending = [];
  /** Surfaces the service holds, oldest first: it fills them in the order they were queued. */
  const queued = [...surfaces];
  /** @type {typeof surfaces[number] | null} */
  let ready = null;
  /** @type {Map<number, {id: number, width: number, height: number, timestamp: bigint, endOfStream: boolean}>} */
  const arrived = new Map();
  let nextInput = 0;
  let frames = 0;
  /** @type {string[]} */
  const steps = [];
  /** @type {string[]} */
  let frameSteps = [];
  const TRACED_FRAMES = 5;

  /** @param {() => string} step built only while the frame is traced */
  function note(step) {
    if (frames < TRACED_FRAMES) frameSteps.push(step());
  }

  /**
   * Runs one backend stage; an error leaves with the frame count and the traced steps, the
   * unfinished frame's included.
   * @template T @param {() => T} stage
   */
  function traced(stage) {
    try {
      return stage();
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      const trace = [...steps, ...(frameSteps.length ? ['#' + (frames + 1) + ' ' + frameSteps.join(', ')] : [])];
      throw Error(cause + ' after ' + frames + ' AV1 frames\nAV1 steps: ' + trace.join('; '));
    }
  }

  /** Every call_rop runs on the loader's one thread, so its IPC buffer never moves. */
  function threadBuffer() {
    if (tls) return tls;

    const pointer = call(functions.tls);
    if (pointer < 0x1000n || pointer >= 1n << 39n) throw Error('Invalid thread-local buffer');
    tls = pointer;
    return tls;
  }

  /**
   * Lays out a 64-byte request as eight qwords, the header word and its word count first. The
   * staging copy keeps what it last held, so only changed qwords are stored.
   * @param {number} header @param {number} words @param {bigint[]} body the qwords after the header
   */
  function compose(header, words, body) {
    const qwords = [BigInt(header) | (BigInt(words) << 32n), ...body];
    for (let index = 0; index < 8; index++) {
      const value = qwords[index] ?? 0n;
      if (staged[index] === value) continue;

      write64(staging + BigInt(index * 8), value);
      staged[index] = value;
    }
  }

  /**
   * One synchronous request on the session through the thread's IPC buffer, nothing in between.
   * Returns the reply's qword at +8: the result word, then the first payload word.
   * @param {string} name
   * @param {bigint} expected the reply header under the TIPC mask
   * @param {number} replyBytes
   */
  function exchange(name, expected, replyBytes) {
    const buffer = threadBuffer();

    call(functions.copy, buffer, staging, 64n);
    const kernel = Number(call(functions.send, session) & 0xffffffffn);
    call(functions.copy, reply, buffer, BigInt(replyBytes));
    if (kernel) throw Error(name + ' kernel result 0x' + kernel.toString(16));

    if ((read64(reply) & 0x800003ffffffffffn) !== expected) throw Error('Unexpected AV1 reply to ' + name);
    const first = read64(reply + 8n);
    const result = Number(first & 0xffffffffn);
    if (result) {
      note(() => name + ' 0x' + result.toString(16));
      throw Error(name + ' returned 0x' + result.toString(16));
    }
    return first;
  }

  /** @param {DecodeUnit} unit */
  function submit(unit) {
    if (unit.length > inputBytes) throw Error('Access unit exceeds decoder input capacity');

    const input = inputs[nextInput];
    nextInput = (nextInput + 1) % inputs.length;
    call(functions.copy, input, unit.source, BigInt(unit.length));

    const length = BigInt(unit.length);
    const high = ((input >> 4n) & 0xf0000000n) | ((input >> 34n) & 0x3fffffcn) | ((length >> 8n) & 0xf000000n);
    const pts = BigInt.asUintN(64, unit.pts);
    compose(0x10007d, 3, [length | ((input & 0xffffffffn) << 32n), high | ((pts & 0xffffffffn) << 32n), pts >> 32n]);
    exchange('AV1 input', 0x30000007dn, 64);
    pending.push(unit.pts);
    note(() => 'submit ' + unit.length + 'B ok');
  }

  /** @param {typeof surfaces[number]} surface */
  function fenceReady(surface) {
    const state = Number(call(functions.ready, surface.fence) & 0xffffffffn);
    if (state !== 0 && state !== 1) throw Error('Unexpected AV1 fence state');
    return state === 1;
  }

  /**
   * Polls the oldest queued surface's fence until it signals, as the title's worker does: true
   * then, false as soon as `until` holds first.
   * @param {() => boolean} [until]
   */
  function wait(until) {
    if (!pending.length) throw Error('No AV1 unit is in flight');
    const oldest = queued[0];
    if (!oldest) throw Error('No AV1 surface is queued');

    const deadline = Date.now() + 5000;
    let polls = 0;
    do {
      native.pump?.();
      polls++;
      if (fenceReady(oldest)) {
        ready = oldest;
        note(() => 'fence s' + oldest.id + ' after ' + polls + ' polls');
        return true;
      }
      if (until?.()) return false;
    } while (Date.now() < deadline);
    note(() => 'fence s' + oldest.id + ' unsignaled after ' + polls + ' polls');
    throw Error('AV1 decode timed out');
  }

  /**
   * Hands a surface back to the service with 330, the title's release (nnCompat +0x148c90): its
   * registration id and a 16-byte consumer fence, zero after a CPU readback. 327 registers a surface
   * once per session and refuses it again. The reply carries the surface's next 16-byte fence at +12.
   * @param {typeof surfaces[number]} surface
   */
  function release(surface) {
    compose(0x14a, 8, [BigInt(surface.id)]);
    const first = exchange('AV1 release surface', 0x90000014an, 64);
    const middle = read64(reply + 16n);
    const last = read64(reply + 24n);
    write64(surface.fence, (first >> 32n) | ((middle & 0xffffffffn) << 32n));
    write64(surface.fence + 8n, (middle >> 32n) | ((last & 0xffffffffn) << 32n));
    queued.push(surface);
    note(() => 'release s' + surface.id + ' ok');
  }

  /**
   * The output metadata of `surface`. The service may answer 229 for another surface first; that
   * answer waits for its surface, as the title's metadata cache (nnCompat +0x148e20) keeps it.
   * @param {typeof surfaces[number]} surface
   */
  function metadata(surface) {
    const cached = arrived.get(surface.id);
    if (cached) {
      arrived.delete(surface.id);
      return cached;
    }

    for (let reads = 0; reads <= surfaces.length; reads++) {
      compose(0xe5, 0, []);
      const first = exchange('AV1 output', 0x11000000e5n, 128);
      const size = read64(reply + 16n);
      const stamp = read64(reply + 32n);
      const flags = read64(reply + 40n);
      const entry = {id: Number(first >> 32n), width: Number(size & 0xffffffffn), height: Number(size >> 32n),
        timestamp: (stamp >> 32n) | ((flags & 0xffffffffn) << 32n), endOfStream: ((flags >> 32n) & 1n) === 1n};
      note(() => 'metadata s' + entry.id + ' ' + entry.width + 'x' + entry.height + ' ts ' + entry.timestamp);
      if (entry.endOfStream && entry.timestamp === 0n) throw Error('AV1 decoder ended the stream without a frame');
      if (entry.id === surface.id) return entry;

      if (!surfaces.some(other => other.id === entry.id)) throw Error('AV1 output names an unknown surface');
      arrived.set(entry.id, entry);
    }
    throw Error('AV1 output never named s' + surface.id);
  }

  /**
   * Reads the frame's metadata, untiles its surface into `target`, the destination unless given,
   * and releases the surface. Returns the frame's input timestamp.
   */
  function output(target = context.destination) {
    const surface = ready;
    if (!surface) throw Error('No AV1 surface is ready');

    const shown = metadata(surface);
    const coded = shown.width === width && shown.height === height;
    const displayed = shown.width === displayWidth && shown.height === displayHeight;
    if (!coded && !displayed) throw Error('AV1 frame size changed');
    const timestamp = shown.timestamp;
    const shownIndex = pending.findIndex(entry => entry * 1000n === timestamp);
    if (shownIndex < 0) throw Error('AV1 output timestamp does not match an input');
    const pts = pending.splice(0, shownIndex + 1)[shownIndex];

    const untiled = Number(call(functions.readback, surface.record, target) & 0xffffffffn);
    note(() => 'untile ' + untiled);
    if (untiled) throw Error('AV1 untile returned 0x' + untiled.toString(16));
    queued.splice(queued.indexOf(surface), 1);
    ready = null;

    release(surface);
    if (frames < TRACED_FRAMES) steps.push('#' + (frames + 1) + ' ' + frameSteps.join(', '));
    frameSteps = [];
    frames++;
    return pts.toString();
  }

  return {
    submit: unit => traced(() => submit(unit)),
    wait: until => traced(() => wait(until)),
    output: target => traced(() => output(target)),
    frameBytes,
    format: {stride: width, sliceHeight: height},
    report: () => ({frames, steps: [...steps]})
  };
}
