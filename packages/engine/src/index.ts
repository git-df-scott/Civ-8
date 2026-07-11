/**
 * @civ8/engine — the deterministic Civilization VIII simulation core.
 *
 * M2: everything from M1 plus the world — axial hex math, typed-array
 * MapState with base64 canonical serialization, the staged mapgen pipeline
 * (each stage on its own `mapgen:<stage>` RNG substream), and save format
 * v1 with the v0→v1 migration. Everything observable is a function of
 * (seed, commandLog); see docs/determinism.md for the contract.
 */

// RNG
export { Pcg32, fnv1a32, splitmix32, type Pcg32State } from './rng/pcg32';
export { GameRng, type RngStreamStates } from './rng/gameRng';

// Serialization & hashing
export { canonicalStringify, sortedKeys } from './serialize/canonical';
export { fnv1a64Hex, fnv1a64HexBytes, hashState } from './serialize/hash';
export { base64ToBytes, bytesToBase64 } from './serialize/base64';
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
export { playerId, tileIndex, type Branded, type PlayerId, type TileIndex } from './ids';
export { SortedMap } from './state/sortedMap';
export {
  DEFAULT_MAP_SIZE,
  DEFAULT_PLAYER_NAMES,
  type GamePhase,
  type GameState,
  type Player,
  type SerializedState,
} from './state/gameState';

// Map: hex math, grid, terrain tables, mapgen
export {
  HEX_DIRECTIONS,
  axialDistanceUnwrapped,
  hexDistance,
  hexLine,
  neighborIndex,
  oppositeDirection,
  qOfIndex,
  rOfIndex,
  toTileIndex,
  wrapQ,
} from './map/hex';
export {
  MAP_SIZES,
  MAP_SIZE_NAMES,
  cloneMapState,
  createEmptyMapState,
  deserializeMapState,
  hasAnyRiverEdge,
  hasRiverEdge,
  isMapSizeName,
  riverEdgesAreMirrored,
  serializeMapState,
  setRiverEdge,
  type MapSizeName,
  type MapState,
  type SerializedMapState,
} from './map/grid';
export {
  ELEVATION_HILLS_MIN,
  ELEVATION_LAND_MIN,
  ELEVATION_MOUNTAIN_MIN,
  FEATURE,
  FEATURE_COUNT,
  RELIEF,
  RESOURCE,
  RESOURCE_COUNT,
  TERRAIN,
  TERRAIN_COUNT,
  isWaterTerrain,
  reliefOf,
  type FeatureId,
  type ReliefId,
  type ResourceId,
  type TerrainId,
} from './map/terrain';
export {
  MAPGEN_STAGES,
  MapgenValidationError,
  generateMapForSeed,
  mapgenStreamName,
  runMapgen,
  type MapgenContext,
  type MapgenStage,
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
export { EngineInvariantError, Game, type CreateGameOptions } from './game';
export { END_TURN, runEndTurns, type TurnRunReport } from './turnRunner';
