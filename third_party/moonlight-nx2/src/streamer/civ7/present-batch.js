// Acquire, submit, present and wait on the retained swapchain. Shipped by toString().

/** @import {ConsoleNative, ConsoleRequest} from './console-runtime.js' */

/** @typedef {'acquire' | 'submit' | 'present' | 'wait'} PresentStep */

/**
 * Presents frame slot `slot` with its streaming command buffer unless `interactive`, and returns
 * the image index; `timings` sums each step's milliseconds. With `deferWait` each slot's submit
 * signals its fence, `release(slot)` waits for it before the decoder writes the slot and
 * `finish()` waits for both; without it each present waits for the queue. README.md, "Frame slots".
 * @typedef {((slot?: number, interactive?: boolean) => number) & {timings: Record<PresentStep, number>,
 *   release(slot: number): void, finish(): void}} Present
 */

/**
 * @typedef {Pick<ConsoleNative, 'address' | 'integer' | 'checkMemory' | 'verified' | 'call' | 'read32' |
 *   'write32' | 'write64'> & {now?: () => number,
 *   overlay?: ReturnType<typeof import('./rate-badge.js').createOverlay>}} PresentNative  `now` times the
 *   steps, else Date.now; `overlay` is the stream's rate badge (rate-badge.js)
 */

/**
 * @param {PresentNative} native
 * @param {ConsoleRequest} request
 * @returns {Present}
 */
export function createPresentation(native, request) {
  const {address, integer, checkMemory, verified, call, read32, write32, write64} = native;
  const memory = address(request.memory);
  checkMemory(memory, 0x1000, 3);
  const device = address(request.device);
  const queue = address(request.queue);
  const swapchain = address(request.swapchain);
  const acquired = address(request.acquired);
  const commandList = Array.isArray(request.commands) ? request.commands : null;
  const count = integer(commandList?.length, 2, 8);
  if (!commandList || !Array.isArray(request.semaphores) || request.semaphores.length !== count)
    throw Error('Presentation semaphore count differs from command count');
  const commands = commandList.map(address);
  const semaphores = request.semaphores.map(address);
  if ([device, queue, swapchain, acquired, ...commands, ...semaphores].some(value => value === 0n))
    throw Error('Null presentation handle');
  /**
   * The per-slot command buffers, acquire semaphores and fences.
   * @param {ConsoleRequest | undefined} request
   */
  function presentationSlots(request) {
    if (!request) throw Error('Presentation needs frame slots');
    const lists = (/** @type {unknown} */ value) => {
      const ok = Array.isArray(value) && value.length === 2 &&
        value.every(list => Array.isArray(list) && list.length === count);
      if (!ok) throw Error('Presentation slots differ from the swapchain');
      return value.map(list => list.map(address));
    };
    const pair = (/** @type {unknown} */ value) => {
      if (!Array.isArray(value) || value.length !== 2) throw Error('Presentation slots need two handles each');
      return value.map(address);
    };
    const result = {interactive: lists(request.interactive), streaming: lists(request.streaming),
      acquired: pair(request.acquired), fences: pair(request.fences)};
    const handles = [...result.interactive.flat(), ...result.streaming.flat(), ...result.acquired, ...result.fences];
    if (handles.some(value => value === 0n)) throw Error('Null presentation slot handle');
    return result;
  }

  const named = /** @type {Record<string, unknown>} */ (request.functions);
  const slots = presentationSlots(/** @type {ConsoleRequest | undefined} */ (request.slots));
  /** @type {Record<string, bigint>} */
  const functions = {};
  for (const name of ['acquire', 'submit', 'present', 'wait', 'waitFences', 'resetFences']) {
    const pointer = address(named[name]);
    if (!verified.has('0x' + pointer.toString(16))) throw Error('Unverified presentation function: ' + name);
    functions[name] = pointer;
  }
  /** @type {{function: bigint, layer: bigint, width: bigint, height: bigint} | null} */
  let crop = null;
  if (request.crop) {
    const config = /** @type {ConsoleRequest} */ (request.crop);
    const fn = address(config.function);
    const layer = address(config.layer);
    const width = integer(config.width, 0, 3840);
    const height = integer(config.height, 0, 2160);
    if (!verified.has('0x' + fn.toString(16))) throw Error('Unverified layer crop function');
    if ((width === 0) !== (height === 0)) throw Error('Invalid layer crop dimensions');
    checkMemory(layer, 0x508, 3);
    crop = {function: fn, layer, width: BigInt(width), height: BigInt(height)};
  }

  for (let offset = 0; offset < 0x1000; offset += 8) write64(memory + BigInt(offset), 0n);
  /**
   * @param {number} offset
   * @param {number} value
   */
  const word = (offset, value) => write32(memory + BigInt(offset), BigInt(value));
  /**
   * @param {number} offset
   * @param {bigint} value
   */
  const pointer = (offset, value) => write64(memory + BigInt(offset), value);
  word(0x100, 1000060010);
  pointer(0x110, swapchain);
  pointer(0x118, 2000000000n);
  pointer(0x120, acquired);
  word(0x130, 1);
  pointer(0x200, acquired);
  word(0x220, 0x400);
  pointer(0x228, swapchain);
  word(0x300, 4);
  word(0x310, 1);
  pointer(0x318, memory + 0x200n);
  pointer(0x320, memory + 0x220n);
  word(0x328, 1);
  pointer(0x330, memory + 0x208n);
  word(0x338, 1);
  pointer(0x340, memory + 0x210n);
  word(0x400, 1000001001);
  word(0x410, 1);
  pointer(0x418, memory + 0x210n);
  word(0x420, 1);
  pointer(0x428, memory + 0x228n);
  pointer(0x430, memory);
  const overlay = native.overlay?.attach();

  const timings = {acquire: 0, submit: 0, present: 0, wait: 0};
  const clock = native.now || (() => Date.now());
  const deferred = request.deferWait === true;
  const pending = [false, false];
  let acquiring = -1;
  for (let slot = 0; slot < 2; slot++) pointer(0x500 + slot * 8, slots.fences[slot]);
  /**
   * @param {PresentStep} name the timing it counts under
   * @param {bigint[]} args
   * @param {string} [fn] the function, when it is not `name`
   */
  function success(name, args, allowSuboptimal = false, fn = name) {
    const started = clock();
    const result = Number(BigInt.asIntN(32, call(functions[fn], ...args)));
    timings[name] += clock() - started;
    if (result !== 0 && !(allowSuboptimal && result === 1000001003))
      throw Error('Presentation ' + name + ' returned ' + result);
  }
  /**
   * The slot's own acquire semaphore, so a second present in flight never re-signals one a
   * pending submit still waits on.
   * @param {number} slot
   */
  function useAcquired(slot) {
    if (slot === acquiring) return;

    pointer(0x120, slots.acquired[slot]);
    pointer(0x200, slots.acquired[slot]);
    acquiring = slot;
  }

  /** @param {number} slot */
  function release(slot) {
    if (!pending[slot]) return;

    pending[slot] = false;
    const fence = memory + BigInt(0x500 + slot * 8);
    success('wait', [device, 1n, fence, 1n, 2000000000n], false, 'waitFences');
    success('wait', [device, 1n, fence], false, 'resetFences');
  }

  const present = (slot = 0, interactive = true) => {
    if (slot !== 0 && slot !== 1) throw Error('Invalid presentation slot');
    useAcquired(slot);
    word(0, 0xffffffff);
    success('acquire', [device, memory + 0x100n, memory], true);
    const index = Number(read32(memory));
    if (index >= count) throw Error('Invalid acquired image index');
    const list = (interactive ? slots.interactive : slots.streaming)[slot];
    pointer(0x208, list[index]);
    if (overlay?.armed) overlay.frame();
    pointer(0x210, semaphores[index]);
    success('submit', [queue, 1n, memory + 0x300n, deferred ? slots.fences[slot] : 0n]);
    if (crop) call(crop.function, crop.layer, 0n, 0n, crop.width, crop.height);
    success('present', [queue, memory + 0x400n], true);
    if (deferred) pending[slot] = true;
    else success('wait', [queue]);
    return index;
  };
  present.timings = timings;
  present.release = release;
  present.finish = () => {
    release(0);
    release(1);
  };
  return present;
}

/**
 * `present-batch`: presents `frames` images, reading input and polling the UI between them. With
 * `intervals`, also the ms between consecutive presents, for the refresh-rate probe's pacing check.
 * @param {PresentNative & Pick<ConsoleNative, 'read64' | 'readMemory' | 'writeBuffer'> &
 *   {createPresentation: typeof createPresentation,
 *   createInputReader: typeof import('./input.js').createInputReader, ui?: {poll: () => void} | null}} native
 * @param {ConsoleRequest} request
 */
export function presentBatch(native, request) {
  const frames = native.integer(request.frames, 1, 240);
  const present = native.createPresentation(native, request);
  const configuration = /** @type {ConsoleRequest | undefined} */ (request.input);
  const input = configuration ? native.createInputReader(native, configuration) : null;
  const clock = native.now || (() => Date.now());
  const timed = request.intervals === true;
  const started = Date.now();
  /** @type {number[]} */
  const images = [];
  /** @type {number[]} */
  const intervals = [];
  let last = clock();
  for (let index = 0; index < frames; index++) {
    if (input) input();
    images.push(present());
    if (timed) {
      const now = clock();
      intervals.push(now - last);
      last = now;
    }
    native.ui?.poll();
  }

  const reply = {frames, elapsedMs: Date.now() - started, images, timings: present.timings};
  return timed ? {...reply, intervals} : reply;
}
