/**
 * @civ8/engine — the deterministic Civilization VIII simulation core.
 *
 * M1: full GameState/Command/Event skeleton, command registry, RNG
 * substreams, save/load with a migration framework (v0), and the shared
 * turn-runner. Everything observable is a function of (seed, commandLog);
 * see docs/determinism.md for the contract.
 */

// RNG
export { Pcg32, fnv1a32, splitmix32, type Pcg32State } from './rng/pcg32';
export { GameRng, type RngStreamStates } from './rng/gameRng';

// Serialization & hashing
export { canonicalStringify, sortedKeys } from './serialize/canonical';
export { fnv1a64Hex, hashState } from './serialize/hash';
export {
  migrations,
  migrateAndValidateSave,
  SaveLoadError,
  type SaveMigration,
} from './serialize/migrations/index';

// IDs & state
// Raw-state plumbing (createInitialState, serializeGameState,
// deserializeGameState, toCanonicalView) is deliberately NOT exported: the
// Game facade is the single write entry point (doc 04 §3.2). Engine tests
// import internals via relative src paths. SerializedState stays as a
// type-only export — it is part of the SaveGame shape.
export { playerId, type Branded, type PlayerId } from './ids';
export { SortedMap } from './state/sortedMap';
export {
  DEFAULT_PLAYER_NAMES,
  type GamePhase,
  type GameState,
  type Player,
  type SerializedState,
} from './state/gameState';

// Commands & events
export type {
  Command,
  CommandHandler,
  EndTurnCommand,
  GameEvent,
  Result,
  RuleViolation,
  TurnEndedEvent,
} from './commands/types';

// Saves
export {
  CONTENT_HASH_PLACEHOLDER,
  ENGINE_VERSION,
  SAVE_VERSION,
  type SaveGame,
} from './save/saveGame';
export { isKnownCommand, validateTurnHashes } from './save/validation';

// Facade & turn-runner
export { EngineInvariantError, Game } from './game';
export { END_TURN, runEndTurns, type TurnRunReport } from './turnRunner';
