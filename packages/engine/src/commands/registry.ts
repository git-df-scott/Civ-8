/**
 * Command registry (doc 04 §3.2): the handler map keyed by command type that
 * replaces per-command if-chains. Registering a command = adding one entry.
 * An unknown command type simply has no entry, and `execute` turns that into
 * a RuleViolation.
 */

import { endTurnHandler } from './endTurn';
import type { Command, CommandHandler } from './types';

type CommandRegistry = {
  readonly [K in Command['type']]: CommandHandler<Extract<Command, { type: K }>>;
};

const registry: CommandRegistry = {
  EndTurn: endTurnHandler,
};

/** Test-only handler overrides — see __setCommandHandlerForTests. */
const testOverrides = new Map<string, CommandHandler<Command>>();

/**
 * Test-only seam: override (or, with undefined, restore) the handler for a
 * command type. Lets engine tests inject faulty handlers (e.g. an apply()
 * that throws mid-mutation) without polluting the real registry. Not exported
 * from the package index — import via a relative src path in tests only.
 */
export function __setCommandHandlerForTests(
  type: string,
  handler: CommandHandler<Command> | undefined,
): void {
  if (handler === undefined) {
    testOverrides.delete(type);
  } else {
    testOverrides.set(type, handler);
  }
}

/**
 * Look up the handler for a command type; undefined for unregistered types.
 * The cast is sound because registry keys are exactly Command['type'] and the
 * caller only ever passes cmd to the handler looked up under cmd.type.
 */
export function getCommandHandler(type: string): CommandHandler<Command> | undefined {
  return (
    testOverrides.get(type) ??
    (registry as Record<string, CommandHandler<Command> | undefined>)[type]
  );
}

/** True when `type` names a registered command (doc 04 §3.2 registry). */
export function isKnownCommand(type: string): boolean {
  return (registry as Record<string, unknown>)[type] !== undefined;
}
