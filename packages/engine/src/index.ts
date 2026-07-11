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

// Map: hex math, grid, sizes, terrain tables, mapgen
export {
  HEX_DIRECTION_COUNT,
  HEX_DIR_Q,
  HEX_DIR_R,
  hexDistance,
  hexLine,
  neighborTile,
  oppositeDirection,
  tileCol,
  tileIndex,
  tileIndexOf,
  tileRow,
  wrapQ,
  type TileIndex,
} from './map/hex';
export {
  createMapState,
  deserializeMapState,
  mapNeighbor,
  serializeMapState,
  tileCount,
  type MapState,
  type SerializedMapState,
} from './map/grid';
export {
  DEFAULT_MAP_SIZE,
  isMapSizeName,
  MAP_SIZE_NAMES,
  MAP_SIZES,
  type MapDimensions,
  type MapSizeName,
} from './map/sizes';
export {
  FEATURE,
  FEATURE_COUNT,
  HILLS_ELEVATION,
  isWaterTerrain,
  MOUNTAIN_ELEVATION,
  RELIEF,
  reliefOf,
  RESOURCE,
  RESOURCE_COUNT,
  RESOURCE_SPECS,
  TERRAIN,
  TERRAIN_COUNT,
  type FeatureId,
  type ReliefId,
  type ResourceId,
  type ResourceSpec,
  type TerrainId,
} from './map/terrain';
export {
  computeDiagnostics,
  generateMap,
  MapgenValidationError,
  type MapgenDiagnostics,
} from './map/mapgen/index';

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
