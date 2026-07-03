/**
 * EndTurn — the only M1 command. Delegates seat advancement to the
 * turn-scheduler seam (state/turnScheduler.ts): seats advance in ascending-ID
 * order and the turn counter increments on wrap. Draws one value from the
 * 'turn' RNG substream so the state hash visibly evolves every EndTurn.
 */

import { advanceSeat } from '../state/turnScheduler';
import type { CommandHandler, EndTurnCommand } from './types';

export const endTurnHandler: CommandHandler<EndTurnCommand> = {
  validate(state) {
    if (state.phase !== 'playing') {
      return { code: 'GAME_ENDED', message: 'Cannot end a turn: the game has ended.' };
    }
    if (state.players.size === 0) {
      return { code: 'NO_PLAYERS', message: 'Cannot end a turn: the game has no players.' };
    }
    return null;
  },

  apply(state, _cmd, rng) {
    const endingPlayer = state.activePlayer;
    // Captured BEFORE advanceSeat: TurnEnded.turn is the game turn during
    // which this seat ended, unaffected by the wrap increment.
    const endedDuringTurn = state.turn;
    state.lastTurnDraw = rng.stream('turn').nextUint32();
    advanceSeat(state); // non-empty: validate checked size > 0
    return [{ type: 'TurnEnded', player: endingPlayer, turn: endedDuringTurn }];
  },
};
