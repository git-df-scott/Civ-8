/**
 * Commands, events, and the handler contract (doc 04 §3.2).
 *
 * Commands are small serializable player intents; events are the derived,
 * never-authoritative output feed. Both unions grow milestone by milestone.
 */

import type { PlayerId } from '../ids';
import type { GameRng } from '../rng/gameRng';
import type { GameState } from '../state/gameState';

export interface EndTurnCommand {
  readonly type: 'EndTurn';
}

/** M1: EndTurn is the only command. */
export type Command = EndTurnCommand;

export interface TurnEndedEvent {
  readonly type: 'TurnEnded';
  /** The player whose turn just ended. */
  readonly player: PlayerId;
  /**
   * The game turn during which this seat ended — captured BEFORE the seat
   * order wraps and increments the turn counter. Every seat of round N
   * reports turn N, including the last seat whose EndTurn advances the game
   * to round N+1. (Event payloads are derived output and are never hashed.)
   */
  readonly turn: number;
}

/** M1: TurnEnded is the only event. */
export type GameEvent = TurnEndedEvent;

export interface RuleViolation {
  readonly code: string;
  readonly message: string;
}

export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/**
 * One registered command's rules. `validate` must not mutate anything;
 * `apply` runs only after validate returns null and mutates state directly
 * (determinism comes from the command log, not structural sharing).
 */
export interface CommandHandler<C extends Command> {
  validate(state: GameState, cmd: C): RuleViolation | null;
  apply(state: GameState, cmd: C, rng: GameRng): GameEvent[];
}
