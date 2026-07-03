/**
 * GameRng — the named-substream RNG manager (doc 04 §3.3).
 *
 * Owns the live Pcg32 substreams of one game. Streams are created lazily from
 * `Pcg32.stream(masterSeed, name)` on first use, so adding a draw to one
 * stream never shifts another. Positions serialize to a plain sorted-by-name
 * record and restore exactly, so RNG state survives save/load byte-for-byte.
 */

import { sortedKeys } from '../serialize/canonical';
import { Pcg32, type Pcg32State } from './pcg32';

/** Serialized substream positions, keyed by stream name. */
export type RngStreamStates = Record<string, Pcg32State>;

export class GameRng {
  readonly masterSeed: number;
  private readonly live = new Map<string, Pcg32>();

  constructor(masterSeed: number) {
    this.masterSeed = masterSeed >>> 0;
  }

  static fromState(masterSeed: number, streams: RngStreamStates): GameRng {
    const rng = new GameRng(masterSeed);
    for (const name of sortedKeys(streams)) {
      rng.live.set(name, Pcg32.fromState(streams[name] as Pcg32State));
    }
    return rng;
  }

  /** The named substream, created at its seeded origin on first use. */
  stream(name: string): Pcg32 {
    let stream = this.live.get(name);
    if (stream === undefined) {
      stream = Pcg32.stream(this.masterSeed, name);
      this.live.set(name, stream);
    }
    return stream;
  }

  /**
   * Current positions of every substream touched so far, sorted by name.
   * `live` is genuinely a Map (string-keyed live Pcg32 instances, not plain
   * serializable data), and Map key iteration is spec-defined insertion
   * order; the explicit sort makes the result order-independent anyway.
   */
  getState(): RngStreamStates {
    const state: RngStreamStates = {};
    for (const name of [...this.live.keys()].sort()) {
      state[name] = (this.live.get(name) as Pcg32).getState();
    }
    return state;
  }
}
