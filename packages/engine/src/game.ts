/**
 * Game — the facade and single write entry point (doc 04 §3.2).
 *
 * Everything observable is a function of (seed, commandLog). The Game records
 * every executed command and a per-EndTurn hash chain, so any live game can
 * produce a full SaveGame at any moment, and any SaveGame can be either
 * restored directly (fast path, `Game.load`) or re-derived from its seed and
 * command log (verification path, `Game.replay`).
 */

import { getCommandHandler } from './commands/registry';
import type { Command, GameEvent, Result, RuleViolation } from './commands/types';
import { GameRng } from './rng/gameRng';
import {
  CONTENT_HASH_PLACEHOLDER,
  ENGINE_VERSION,
  SAVE_VERSION,
  type SaveGame,
} from './save/saveGame';
import { migrateAndValidateSave } from './serialize/migrations/index';
import { hashState } from './serialize/hash';
import {
  createInitialState,
  deserializeGameState,
  serializeGameState,
  toCanonicalView,
  type GameState,
} from './state/gameState';

/**
 * Thrown when an engine invariant is violated — e.g. a command handler's
 * apply() threw mid-mutation, leaving live state possibly advanced with the
 * command absent from the log. A Game that raised this is poisoned: every
 * subsequent execute()/hash()/snapshot() rethrows it rather than risking
 * silent live/replay divergence.
 */
export class EngineInvariantError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EngineInvariantError';
  }
}

const POISONED_MESSAGE =
  'command apply threw; state may be inconsistent — this game instance is poisoned';

export class Game {
  private readonly state: GameState;
  private readonly rng: GameRng;
  private readonly commandLog: Command[];
  private readonly turnHashList: string[];
  /** Set when a handler's apply() threw; the instance is unusable after. */
  private corrupted = false;

  private constructor(state: GameState, rng: GameRng, commandLog: Command[], turnHashes: string[]) {
    this.state = state;
    this.rng = rng;
    this.commandLog = commandLog;
    this.turnHashList = turnHashes;
  }

  static create(options: { seed: number }): Game {
    const state = createInitialState(options.seed);
    return new Game(state, new GameRng(state.seed), [], []);
  }

  /**
   * Fast load path (doc 04 §3.4): migrate + validate the raw save, then
   * restore the snapshot, command log, and hash chain directly. Accepts
   * unknown input (e.g. freshly parsed JSON); throws SaveLoadError with a
   * clear message on version or shape problems.
   */
  static load(rawSave: unknown): Game {
    const save = migrateAndValidateSave(rawSave);
    const state = deserializeGameState(save.snapshot);
    const rng = GameRng.fromState(state.seed, state.rng);
    return new Game(state, rng, [...save.commandLog], [...save.turnHashes]);
  }

  /**
   * Verification path (doc 04 §3.4): re-derive a game from its seed and
   * command log. The result's hash chain must match the original's — replay
   * tests, golden logs, and desync forensics all rest on this.
   */
  static replay(seed: number, commandLog: readonly Command[]): Game {
    const game = Game.create({ seed });
    for (const [index, cmd] of commandLog.entries()) {
      const result = game.execute(cmd);
      if (!result.ok) {
        throw new Error(
          `Replay diverged: command ${index} (${cmd.type}) rejected: ` +
            `${result.error.code}: ${result.error.message}`,
        );
      }
    }
    return game;
  }

  /** Rethrows on a poisoned instance (a handler's apply() threw earlier). */
  private assertNotCorrupted(): void {
    if (this.corrupted) {
      throw new EngineInvariantError(POISONED_MESSAGE);
    }
  }

  /** The single write entry point (doc 04 §3.2). */
  execute(cmd: Command): Result<GameEvent[], RuleViolation> {
    this.assertNotCorrupted();
    const handler = getCommandHandler(cmd.type);
    if (handler === undefined) {
      return {
        ok: false,
        error: {
          code: 'UNKNOWN_COMMAND',
          message: `Unknown command type: ${String((cmd as { type?: unknown }).type)}`,
        },
      };
    }
    const violation = handler.validate(this.state, cmd);
    if (violation !== null) {
      return { ok: false, error: violation };
    }
    // apply() throwing mid-mutation would leave live state advanced with the
    // command absent from the log — silent live/replay divergence. Fail fast:
    // poison the instance so nothing can be read from or written to it again.
    let events: GameEvent[];
    try {
      events = handler.apply(this.state, cmd, this.rng);
    } catch (cause) {
      this.corrupted = true;
      throw new EngineInvariantError(POISONED_MESSAGE, { cause });
    }
    this.commandLog.push(cmd);
    if (cmd.type === 'EndTurn') {
      this.turnHashList.push(this.hash());
    }
    return { ok: true, value: events };
  }

  get turn(): number {
    return this.state.turn;
  }

  get activePlayer(): number {
    return this.state.activePlayer;
  }

  /** The per-EndTurn hash chain recorded so far. */
  get turnHashes(): readonly string[] {
    return this.turnHashList;
  }

  /** The executed-command log recorded so far. */
  get log(): readonly Command[] {
    return this.commandLog;
  }

  /**
   * The live GameRng owns substream positions; `state.rng` is refreshed from
   * it only here, just before hashing/serialization.
   */
  private syncRngState(): void {
    this.state.rng = this.rng.getState();
  }

  /**
   * Canonical 64-bit FNV-1a hash of the full state. Uses the copy-free
   * canonical view (per-EndTurn hot path); the view is consumed synchronously
   * by canonicalStringify, so no defensive copies are needed.
   */
  hash(): string {
    this.assertNotCorrupted();
    this.syncRngState();
    return hashState(toCanonicalView(this.state));
  }

  /** A complete, detached SaveGame (doc 04 §3.4). */
  snapshot(): SaveGame {
    this.assertNotCorrupted();
    this.syncRngState();
    return {
      saveVersion: SAVE_VERSION,
      engineVersion: ENGINE_VERSION,
      contentHash: CONTENT_HASH_PLACEHOLDER,
      seed: this.state.seed,
      snapshot: serializeGameState(this.state),
      commandLog: [...this.commandLog],
      turnHashes: [...this.turnHashList],
    };
  }
}
