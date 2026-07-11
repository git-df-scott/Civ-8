/**
 * GameState — the full simulation state skeleton (doc 04 §3.1).
 *
 * Plain typed relational state, not ECS: normalized data behind branded IDs,
 * keyed collections behind SortedMap (ascending-ID iteration). The live state
 * holds SortedMaps for ergonomic rules code; `serializeGameState` /
 * `deserializeGameState` convert to/from the canonical plain-data form used
 * for hashing and saves.
 */

import { playerId, type PlayerId } from '../ids';
import type { GameRng, RngStreamStates } from '../rng/gameRng';
import {
  deserializeMapState,
  serializeMapState,
  type MapState,
  type SerializedMapState,
} from '../map/grid';
import { generateMap } from '../map/mapgen/index';
import type { MapSizeName } from '../map/sizes';
import { sortedKeys } from '../serialize/canonical';
import { SortedMap } from './sortedMap';

function cloneRngStates(states: RngStreamStates): RngStreamStates {
  const clone: RngStreamStates = {};
  for (const name of sortedKeys(states)) {
    const stream = states[name];
    if (stream !== undefined) {
      clone[name] = { ...stream };
    }
  }
  return clone;
}

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
}

export type GamePhase = 'playing' | 'ended';

/** Monotonic ID counters — the only place new entity IDs come from. */
export interface NextIds {
  player: number;
  unit: number;
  city: number;
}

/**
 * Live (in-memory) game state. Mutated only by command handlers.
 * Note: the save format version lives only on the SaveGame envelope
 * (save/saveGame.ts SAVE_VERSION) — state carries no copy of it.
 */
export interface GameState {
  turn: number;
  phase: GamePhase;
  /** The player whose turn it currently is. */
  activePlayer: PlayerId;
  /** The 32-bit master seed all RNG substreams derive from. */
  seed: number;
  /**
   * Serialized substream positions. The live GameRng owns the streams; this
   * field is refreshed from it just before hashing/serialization.
   */
  rng: RngStreamStates;
  players: SortedMap<PlayerId, Player>;
  /** The size preset the map was generated with — part of game genesis. */
  mapSize: MapSizeName;
  /** Typed-array tile storage (doc 04 §4). Mutated only by command handlers. */
  map: MapState;
  /** Placeholder until M3 units land (SortedMap<UnitId, Unit>). */
  units: null;
  /** Placeholder until M4 cities land (SortedMap<CityId, City>). */
  cities: null;
  nextIds: NextIds;
  /** Last value drawn from the 'turn' stream — makes per-turn drift visible. */
  lastTurnDraw: number;
}

/** Canonical plain-data form of GameState — what gets hashed and saved. */
export interface SerializedState {
  turn: number;
  phase: GamePhase;
  activePlayer: number;
  seed: number;
  rng: RngStreamStates;
  /** Ascending-ID [id, player] pairs (SortedMap serialized form). */
  players: Array<[number, Player]>;
  mapSize: MapSizeName;
  /** Canonical map form: typed arrays → base64 (doc 04 §3.4). */
  map: SerializedMapState;
  units: null;
  cities: null;
  nextIds: NextIds;
  lastTurnDraw: number;
}

/** M1 games are fixed two-seat games; real setup options arrive with mapgen. */
export const DEFAULT_PLAYER_NAMES: readonly string[] = ['Player 1', 'Player 2'];

/**
 * The initial state is a pure function of (seed, mapSize) — replay depends on
 * this. Mapgen draws only from the `mapgen:<stage>` substreams of `rng`, so
 * game creation never shifts any other stream (doc 04 §3.3).
 */
export function createInitialState(seed: number, rng: GameRng, mapSize: MapSizeName): GameState {
  const players = new SortedMap<PlayerId, Player>();
  let nextPlayer = 0;
  for (const name of DEFAULT_PLAYER_NAMES) {
    const id = playerId(nextPlayer);
    players.set(id, { id, name });
    nextPlayer += 1;
  }
  // Generate the map BEFORE capturing rng state, so state.rng reflects the
  // mapgen substream positions from the very first hash.
  const map = generateMap(rng, mapSize);
  return {
    turn: 0,
    phase: 'playing',
    activePlayer: players.keys()[0] as PlayerId,
    seed: seed >>> 0,
    rng: rng.getState(),
    players,
    mapSize,
    map,
    units: null,
    cities: null,
    nextIds: { player: nextPlayer, unit: 0, city: 0 },
    lastTurnDraw: 0,
  };
}

export function serializeGameState(state: GameState): SerializedState {
  return {
    turn: state.turn,
    phase: state.phase,
    activePlayer: state.activePlayer,
    seed: state.seed,
    rng: cloneRngStates(state.rng),
    players: state.players.toEntries().map(([id, player]) => [id, { ...player }]),
    mapSize: state.mapSize,
    map: serializeMapState(state.map),
    units: state.units,
    cities: state.cities,
    nextIds: { ...state.nextIds },
    lastTurnDraw: state.lastTurnDraw,
  };
}

/**
 * Canonical-stringify input for hashing, built WITHOUT defensive copies —
 * hash() runs once per EndTurn, so this path must not deep-clone the state
 * (players map copy, rng clone, nextIds spread) the way `serializeGameState`
 * does. The result aliases live state: callers must consume it synchronously
 * (feed it to canonicalStringify) and never retain or mutate it. snapshot()
 * keeps deep-copy semantics via `serializeGameState`.
 */
export function toCanonicalView(state: GameState): SerializedState {
  return {
    turn: state.turn,
    phase: state.phase,
    activePlayer: state.activePlayer,
    seed: state.seed,
    rng: state.rng,
    players: state.players.toEntries(),
    mapSize: state.mapSize,
    // Typed arrays must become plain data for canonicalStringify; the base64
    // strings are fresh (unavoidable) but small (~5 bytes/tile pre-encoding).
    map: serializeMapState(state.map),
    units: state.units,
    cities: state.cities,
    nextIds: state.nextIds,
    lastTurnDraw: state.lastTurnDraw,
  };
}

export function deserializeGameState(serialized: SerializedState): GameState {
  return {
    turn: serialized.turn,
    phase: serialized.phase,
    activePlayer: playerId(serialized.activePlayer),
    seed: serialized.seed,
    rng: cloneRngStates(serialized.rng),
    players: SortedMap.fromEntries(
      serialized.players.map(([id, player]): [PlayerId, Player] => [
        playerId(id),
        { id: playerId(player.id), name: player.name },
      ]),
    ),
    mapSize: serialized.mapSize,
    map: deserializeMapState(serialized.map),
    units: serialized.units,
    cities: serialized.cities,
    nextIds: { ...serialized.nextIds },
    lastTurnDraw: serialized.lastTurnDraw,
  };
}
