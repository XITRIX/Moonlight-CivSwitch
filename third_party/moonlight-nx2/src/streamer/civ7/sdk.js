import definitions from './sdk-functions.json' with {type: 'json'};
import filesystem from './filesystem-functions.json' with {type: 'json'};

/** @import {Civ7Rpc} from './transport.js' */

/**
 * Resolves an SDK export by key or symbol, verifying its signature once.
 * @param {Pick<Civ7Rpc, 'a' | 'request'>} rpc
 * @returns {(name: string) => Promise<number>}
 */
export function sdkResolver(rpc) {
  /** @type {Map<string, number>} */
  const cache = new Map();
  return async name => {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;
    const matches = Object.entries({...definitions, ...filesystem})
      .filter(([key, entry]) => key === name || entry.symbol.includes(name));
    if (matches.length !== 1) throw Error('Ambiguous Civ7 SDK symbol: ' + name);
    const definition = matches[0][1];
    const address = rpc.a.sdk + definition.offset;
    await rpc.request({command: 'verify-function', address, hex: definition.hex});
    cache.set(name, address);
    return address;
  };
}
