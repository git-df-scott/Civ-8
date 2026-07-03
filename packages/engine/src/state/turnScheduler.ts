/**
 * Turn scheduler — the seat-advance/round-increment policy seam (doc 04 §3.2
 * lockstep note: turn scheduling must be swappable). M1 policy: seats advance
 * through the players SortedMap in ascending-ID order; when the order wraps
 * back to the first seat, the game turn increments.
 *
 * EndTurn (commands/endTurn.ts) calls advanceSeat rather than owning this
 * policy, so simultaneous-turns or timer-driven scheduling can replace it
 * without touching command handlers.
 */

import type { PlayerId } from '../ids';
import type { GameState } from './gameState';

/**
 * The seat that plays after the current activePlayer (ascending-ID order,
 * wrapping to the first seat). Pure query; requires at least one player.
 */
export function nextSeat(state: GameState): PlayerId {
  const ids = state.players.keys();
  const nextIndex = ids.indexOf(state.activePlayer) + 1;
  return (nextIndex >= ids.length ? ids[0] : ids[nextIndex]) as PlayerId;
}

/**
 * Advances activePlayer to the next seat; owns "wrap increments turn": when
 * the seat order wraps back to the first seat, state.turn increments.
 * Requires at least one player (callers validate).
 */
export function advanceSeat(state: GameState): void {
  const ids = state.players.keys();
  const nextIndex = ids.indexOf(state.activePlayer) + 1;
  const wraps = nextIndex >= ids.length;
  state.activePlayer = (wraps ? ids[0] : ids[nextIndex]) as PlayerId;
  if (wraps) {
    state.turn += 1;
  }
}
