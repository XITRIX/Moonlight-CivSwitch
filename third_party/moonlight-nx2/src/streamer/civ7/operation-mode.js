// Reads nnSdk oe's operation mode: console (docked) or handheld. GetOperationMode aborts the
// title on a failed Result, so its state getter is checked first and any doubt reads as
// handheld. README.md, "Operation mode".
import {sdkResolver} from './sdk.js';

/** @import {Civ7Rpc} from './transport.js' */

/** nnSdk 76bdb395: the GetCommonStateGetter import slot, the am global and the method oe calls. */
export const STATE_GETTER = {importSlot: 11709248, global: 11771232, operationMode: 72, textBytes: 6299648};
const POINTER_LIMIT = 1n << 39n;
const MODES = ['handheld', 'console'];

/** @param {Pick<Civ7Rpc, 'read'>} rpc @param {number} address */
async function readPointer(rpc, address) {
  return (await rpc.read(address, 8)).readBigUInt64LE();
}

/** @param {bigint} pointer */
const pointerOk = pointer => pointer >= 0x1000n && pointer < POINTER_LIMIT && pointer % 8n === 0n;

/**
 * Why oe's call would not reach a live am state getter in nnSdk text, or '' when it would.
 * @param {Pick<Civ7Rpc, 'a' | 'read'>} rpc
 * @param {number} getter GetCommonStateGetter's verified address
 */
export async function stateGetterProblem(rpc, getter) {
  const base = rpc.a.sdk;
  const start = BigInt(base);
  const end = start + BigInt(STATE_GETTER.textBytes);

  if (await readPointer(rpc, base + STATE_GETTER.importSlot) !== BigInt(getter))
    return 'the state getter import leads elsewhere';

  const object = await readPointer(rpc, base + STATE_GETTER.global);
  if (object === 0n) return 'am is not initialized';
  if (!pointerOk(object)) return 'invalid state getter';

  const vtable = await readPointer(rpc, Number(object));
  if (!pointerOk(vtable)) return 'invalid state getter vtable';

  const method = await readPointer(rpc, Number(vtable) + STATE_GETTER.operationMode);
  const methodOk = method >= start && method < end && method % 4n === 0n;
  if (!methodOk) return 'the operation mode method is outside nnSdk text';

  return '';
}

/**
 * The console's operation mode; `docked` is false unless oe answered console.
 * @param {Civ7Rpc} rpc
 * @param {{resolve?: (name: string) => Promise<number>, log?: (event: object) => void,
 *   playback?: boolean}} [options]
 * @returns {Promise<{docked: boolean, mode: string, reason?: string}>}
 */
export async function readOperationMode(rpc, {resolve = sdkResolver(rpc), log = () => {}, playback = false} = {}) {
  /** @param {string} reason */
  const handheld = reason => {
    log({event: 'operation-mode-unknown', reason});
    return {docked: false, mode: 'unknown', reason};
  };

  let operationMode;
  let problem;
  try {
    operationMode = await resolve('operationMode');
    problem = await stateGetterProblem(rpc, await resolve('commonStateGetter'));
  } catch (error) {
    return handheld(error instanceof Error ? error.message : String(error));
  }
  if (problem) return handheld(problem);

  const raw = playback
    ? Number((await rpc.request({command: 'operation-mode', address: operationMode})).raw)
    : Number((await rpc.callAddress(operationMode)).result & 0xffn);
  const mode = MODES[raw] ?? 'unknown';
  log({event: 'operation-mode', mode, raw});
  return {docked: mode === 'console', mode};
}

/**
 * Verifies the SDK functions before playback, then uses the scoped command while streaming.
 * @param {Civ7Rpc} rpc
 * @param {{log?: (event: object) => void}} [options]
 */
export async function createOperationModeReader(rpc, {log = () => {}} = {}) {
  const resolve = sdkResolver(rpc);
  try {
    await resolve('operationMode');
    await resolve('commonStateGetter');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log({event: 'operation-mode-unknown', reason});
    return async () => ({docked: false, mode: 'unknown', reason});
  }
  return () => readOperationMode(rpc, {resolve, playback: true, log});
}
