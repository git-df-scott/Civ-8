/**
 * @civ8/engine — the deterministic Civilization VIII simulation core.
 *
 * M0 walking skeleton: a `Game` facade with a single `EndTurn` command.
 * Everything observable is a function of `(seed, commandLog)`; the state hash
 * evolves every turn because `EndTurn` draws from the 'turn' RNG substream.
 */

import { Pcg32, type Pcg32State } from './rng/pcg32';
import { hashState } from './serialize/hash';

export { Pcg32, fnv1a32, splitmix32, type Pcg32State } from './rng/pcg32';
export { canonicalStringify, sortedKeys } from './serialize/canonical';
export { fnv1a64Hex, hashState } from './serialize/hash';

// ---------------------------------------------------------------------------
// Commands, events, results
// ---------------------------------------------------------------------------

export interface EndTurnCommand {
  readonly type: 'EndTurn';
}

/** M0: EndTurn is the only command. The union grows in M1+. */
export type Command = EndTurnCommand;

export interface TurnEndedEvent {
  readonly type: 'TurnEnded';
  readonly turn: number;
}

export type GameEvent = TurnEndedEvent;

export interface RuleViolation {
  readonly code: string;
  readonly message: string;
}

export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Plain-data engine state. Everything here is canonically serializable. */
export interface EngineState {
  turn: number;
  seed: number;
  /** Serialized position of the 'turn' RNG substream. */
  turnRng: Pcg32State;
  /** Last value drawn from the 'turn' stream — makes per-turn drift visible. */
  lastTurnDraw: number;
}

export const SAVE_VERSION = 0;

export interface SaveGame {
  readonly saveVersion: number;
  readonly seed: number;
  readonly snapshot: EngineState;
}

// ---------------------------------------------------------------------------
// Game facade
// ---------------------------------------------------------------------------

export class Game {
  private readonly state: EngineState;
  private readonly turnStream: Pcg32;

  private constructor(state: EngineState) {
    this.state = state;
    this.turnStream = Pcg32.fromState(state.turnRng);
  }

  static create(options: { seed: number }): Game {
    const seed = options.seed >>> 0;
    const turnStream = Pcg32.stream(seed, 'turn');
    return new Game({
      turn: 0,
      seed,
      turnRng: turnStream.getState(),
      lastTurnDraw: 0,
    });
  }

  /** The single write entry point (doc 04 §3.2). */
  execute(cmd: Command): Result<GameEvent[], RuleViolation> {
    if (cmd.type !== 'EndTurn') {
      return {
        ok: false,
        error: {
          code: 'UNKNOWN_COMMAND',
          message: `Unknown command type: ${String((cmd as { type?: unknown }).type)}`,
        },
      };
    }
    this.state.lastTurnDraw = this.turnStream.nextUint32();
    this.state.turn += 1;
    return { ok: true, value: [{ type: 'TurnEnded', turn: this.state.turn }] };
  }

  get turn(): number {
    return this.state.turn;
  }

  /**
   * The live Pcg32 stream is the single source of truth for the RNG position;
   * `state.turnRng` is refreshed from it only here, just before serialization.
   */
  private syncRngState(): void {
    this.state.turnRng = this.turnStream.getState();
  }

  /** Canonical 64-bit FNV-1a hash of the full state. */
  hash(): string {
    this.syncRngState();
    return hashState(this.state);
  }

  snapshot(): SaveGame {
    this.syncRngState();
    return {
      saveVersion: SAVE_VERSION,
      seed: this.state.seed,
      snapshot: { ...this.state, turnRng: { ...this.state.turnRng } },
    };
  }
}
