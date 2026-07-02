/**
 * @civ8/ai — AI players. Consumes only PlayerView, emits only Commands
 * (doc 04 §5). M0 placeholder: the real layers land in M5/M7.
 */

import type { Command } from '@civ8/engine';

/** The M0 "AI": ends its turn. Proves the ai → engine dependency edge. */
export function decide(): Command[] {
  return [{ type: 'EndTurn' }];
}
