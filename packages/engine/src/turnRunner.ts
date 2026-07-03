/**
 * Shared turn-runner: the run-N-EndTurns/hash-chain loop used by the sim CLI,
 * the tests, and golden-log generation — one implementation so they can never
 * drift apart.
 */

import type { Command } from './commands/types';
import type { Game } from './game';

export const END_TURN: Command = { type: 'EndTurn' };

export interface TurnRunReport {
  /** Hash after each of the `count` EndTurns executed by this run. */
  readonly turnHashes: string[];
  /** The last entry of turnHashes, or the current hash when count is 0. */
  readonly finalHash: string;
}

/** Executes `count` EndTurn commands, collecting the per-EndTurn hash chain. */
export function runEndTurns(game: Game, count: number): TurnRunReport {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`runEndTurns: count must be a non-negative integer, got ${count}`);
  }
  const turnHashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const result = game.execute(END_TURN);
    if (!result.ok) {
      throw new Error(
        `runEndTurns: EndTurn ${i + 1} rejected: ${result.error.code}: ${result.error.message}`,
      );
    }
    const hash = game.turnHashes[game.turnHashes.length - 1];
    if (hash === undefined) {
      throw new Error('runEndTurns: EndTurn did not record a turn hash');
    }
    turnHashes.push(hash);
  }
  return {
    turnHashes,
    finalHash: turnHashes[turnHashes.length - 1] ?? game.hash(),
  };
}
