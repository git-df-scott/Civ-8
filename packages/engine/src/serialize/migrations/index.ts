/**
 * Save-migration framework (doc 04 §3.4).
 *
 * `migrations[N]` upgrades a raw save from version N to N+1. Loading runs the
 * chain from the save's version up to SAVE_VERSION, then structurally
 * validates the result against the current schema. Validation is hand-rolled:
 * the engine has zero runtime dependencies, so no zod here (schema libraries
 * live at the app boundary, doc 04 §2).
 */

import type { Command } from '../../commands/types';
import { DEFAULT_MAP_SIZE, type Player, type SerializedState } from '../../state/gameState';
import { CONTENT_HASH_PLACEHOLDER, SAVE_VERSION, type SaveGame } from '../../save/saveGame';
import { SaveLoadError, fail, isKnownCommand, validateTurnHashes } from '../../save/validation';
import {
  deserializeMapState,
  riverEdgesAreMirrored,
  serializeMapState,
  type SerializedMapState,
} from '../../map/grid';
import { MapgenValidationError, runMapgen, validateMapSemantics } from '../../map/mapgen/index';
import { FEATURE_COUNT, RESOURCE_COUNT, TERRAIN_COUNT } from '../../map/terrain';
import { GameRng } from '../../rng/gameRng';
import { sortedKeys } from '../canonical';
import type { Pcg32State } from '../../rng/pcg32';
import type { RngStreamStates } from '../../rng/gameRng';

export { SaveLoadError } from '../../save/validation';

export type SaveMigration = (raw: unknown) => unknown;

/**
 * v0 → v1 (M2): the world arrived. A v0 snapshot has `map: null` and no
 * `mapgen:*` RNG substreams; v1 requires both. Because the initial state is
 * a pure function of (seed, mapSize), the migration can regenerate exactly
 * the map the v1 engine would have created at Game.create time: run mapgen
 * for the save's seed at DEFAULT_MAP_SIZE and merge the touched substream
 * positions into snapshot.rng. A migrated v0 save is therefore byte- and
 * hash-identical to replaying its command log on the v1 engine (the 'turn'
 * stream never shifted — substream isolation), which the golden-save test
 * asserts. Recorded v0 turnHashes are kept as-is: they are v0-shaped
 * forensics history (doc 04 §3.4 — command logs are guaranteed replayable
 * only within a saveVersion).
 */
function migrateV0ToV1(raw: unknown): unknown {
  const save = asRecord(raw, 'save');
  const snapshot = asRecord(save['snapshot'], 'save.snapshot');
  const seed = asUint32(snapshot['seed'], 'save.snapshot.seed');
  if (snapshot['map'] !== null) {
    fail('save.snapshot.map', 'null (v0 saves have no map)', snapshot['map']);
  }
  const rng = new GameRng(seed);
  const map = runMapgen(rng, DEFAULT_MAP_SIZE);
  const oldStreams = asRecord(snapshot['rng'] ?? {}, 'save.snapshot.rng');
  return {
    ...save,
    saveVersion: 1,
    snapshot: {
      ...snapshot,
      map: serializeMapState(map),
      // Freshly-computed mapgen substream positions always win on a name
      // collision. A genuine v0 save can never legitimately contain a
      // 'mapgen:*' key (mapgen didn't exist at v0), so any such key present
      // in snapshot.rng is definitionally corrupt or hostile input; letting
      // it override the value this migration just computed would silently
      // diverge the migrated game from `Game.replay(seed, log)` on the very
      // stream mapgen depends on. Old (v0) stream positions still win for
      // every name mapgen didn't touch (e.g. 'turn') since those aren't in
      // rng.getState() at all.
      rng: { ...oldStreams, ...rng.getState() },
    },
  };
}

/** Index N migrates saveVersion N → N+1. */
export const migrations: readonly SaveMigration[] = [migrateV0ToV1];

// ---------------------------------------------------------------------------
// Structural validation helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'an object', value);
  }
  return value as Record<string, unknown>;
}

function asInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(path, 'an integer', value);
  }
  return value;
}

function asUint32(value: unknown, path: string): number {
  const n = asInt(value, path);
  if (n < 0 || n > 0xffffffff) {
    fail(path, 'an unsigned 32-bit integer', value);
  }
  return n;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail(path, 'a string', value);
  }
  return value;
}

function asNull(value: unknown, path: string): null {
  if (value !== null) {
    fail(path, 'null', value);
  }
  return null;
}

function validatePcg32State(value: unknown, path: string): Pcg32State {
  const record = asRecord(value, path);
  return {
    stateHi: asUint32(record['stateHi'], `${path}.stateHi`),
    stateLo: asUint32(record['stateLo'], `${path}.stateLo`),
    incHi: asUint32(record['incHi'], `${path}.incHi`),
    incLo: asUint32(record['incLo'], `${path}.incLo`),
  };
}

function validateRngStates(value: unknown, path: string): RngStreamStates {
  const record = asRecord(value, path);
  // '__proto__' is rejected outright: on a plain object `states[name] = ...`
  // would hit the prototype setter and silently drop the stream, and the same
  // hazard exists at every later assignment site (GameRng.getState, clone).
  // No legitimate engine stream is ever named '__proto__'.
  if (Object.prototype.hasOwnProperty.call(record, '__proto__')) {
    throw new SaveLoadError(`Invalid save: forbidden RNG stream name "__proto__" at "${path}"`);
  }
  // Accumulate on a null-prototype object so no key can collide with
  // Object.prototype accessors, then copy to a plain object (object spread
  // uses define-property semantics, preserving every key as a real own key).
  const states: RngStreamStates = Object.create(null) as RngStreamStates;
  for (const name of sortedKeys(record)) {
    states[name] = validatePcg32State(record[name], `${path}.${name}`);
  }
  return { ...states };
}

/**
 * Structure, decode, range, and invariant checks for the serialized map:
 * every base64 field must decode to exactly width×height bytes, every byte
 * must be a legal id for its array, and riverEdges must be mirrored. Beyond
 * that structural layer, the deserialized map is also run through mapgen's
 * own semantic validator (`validateMapSemantics`, reusing the exact checks
 * `runMapgen` enforces at generation time — elevation bounds, resource/
 * feature placement legality, coast adjacency, river connectivity) so a save
 * cannot load a map mapgen itself would have rejected as corrupt or hostile.
 */
function validateMapState(value: unknown, path: string): SerializedMapState {
  const record = asRecord(value, path);
  const width = asInt(record['width'], `${path}.width`);
  const height = asInt(record['height'], `${path}.height`);
  if (width < 2 || width > 1024 || height < 2 || height > 1024) {
    fail(`${path}.width/height`, 'map dimensions within [2, 1024]', `${width}x${height}`);
  }
  const serialized: SerializedMapState = {
    width,
    height,
    terrain: asString(record['terrain'], `${path}.terrain`),
    feature: asString(record['feature'], `${path}.feature`),
    elevation: asString(record['elevation'], `${path}.elevation`),
    resource: asString(record['resource'], `${path}.resource`),
    riverEdges: asString(record['riverEdges'], `${path}.riverEdges`),
  };
  let map;
  try {
    map = deserializeMapState(serialized);
  } catch (error) {
    throw new SaveLoadError(
      `Invalid save: ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const checkRange = (bytes: Uint8Array, name: string, max: number): void => {
    for (let i = 0; i < bytes.length; i++) {
      if ((bytes[i] as number) > max) {
        throw new SaveLoadError(
          `Invalid save: ${path}.${name}[${i}] is ${bytes[i]}, exceeds maximum ${max}`,
        );
      }
    }
  };
  checkRange(map.terrain, 'terrain', TERRAIN_COUNT - 1);
  checkRange(map.feature, 'feature', FEATURE_COUNT - 1);
  checkRange(map.resource, 'resource', RESOURCE_COUNT - 1);
  checkRange(map.riverEdges, 'riverEdges', 0x3f);
  if (!riverEdgesAreMirrored(map)) {
    throw new SaveLoadError(`Invalid save: ${path}.riverEdges is not mirrored across shared edges`);
  }
  try {
    validateMapSemantics(map, width, height);
  } catch (error) {
    if (error instanceof MapgenValidationError) {
      throw new SaveLoadError(
        `Invalid save: ${path}: mapgen semantic validation failed: ${error.diagnostics.join('; ')}`,
      );
    }
    throw error;
  }
  return serialized;
}

function validatePlayers(value: unknown, path: string): Array<[number, Player]> {
  if (!Array.isArray(value)) {
    fail(path, 'an array of [id, player] pairs', value);
  }
  return value.map((entry: unknown, i) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      fail(`${path}[${i}]`, 'an [id, player] pair', entry);
    }
    const id = asInt(entry[0], `${path}[${i}][0]`);
    const playerRecord = asRecord(entry[1], `${path}[${i}][1]`);
    const playerIdValue = asInt(playerRecord['id'], `${path}[${i}][1].id`);
    if (playerIdValue !== id) {
      throw new SaveLoadError(
        `Invalid save: players entry ${i} key ${id} does not match player.id ${playerIdValue}`,
      );
    }
    const player = {
      id: playerIdValue,
      name: asString(playerRecord['name'], `${path}[${i}][1].name`),
    } as Player;
    return [id, player] as [number, Player];
  });
}

function validateSnapshot(value: unknown, path: string): SerializedState {
  const record = asRecord(value, path);
  const phase = asString(record['phase'], `${path}.phase`);
  if (phase !== 'playing' && phase !== 'ended') {
    fail(`${path}.phase`, `'playing' or 'ended'`, phase);
  }
  const nextIds = asRecord(record['nextIds'], `${path}.nextIds`);
  const activePlayer = asInt(record['activePlayer'], `${path}.activePlayer`);
  const players = validatePlayers(record['players'], `${path}.players`);
  // A dangling activePlayer would load cleanly and then EndTurn would
  // silently repoint to seat 0 without incrementing the turn — reject it.
  if (!players.some(([id]) => id === activePlayer)) {
    throw new SaveLoadError(
      `Invalid save: activePlayer ${activePlayer} at "${path}.activePlayer" is not ` +
        `a member of "${path}.players"`,
    );
  }
  return {
    turn: asInt(record['turn'], `${path}.turn`),
    phase,
    activePlayer,
    seed: asUint32(record['seed'], `${path}.seed`),
    rng: validateRngStates(record['rng'], `${path}.rng`),
    players,
    map: validateMapState(record['map'], `${path}.map`),
    units: asNull(record['units'], `${path}.units`),
    cities: asNull(record['cities'], `${path}.cities`),
    nextIds: {
      player: asInt(nextIds['player'], `${path}.nextIds.player`),
      unit: asInt(nextIds['unit'], `${path}.nextIds.unit`),
      city: asInt(nextIds['city'], `${path}.nextIds.city`),
    },
    lastTurnDraw: asUint32(record['lastTurnDraw'], `${path}.lastTurnDraw`),
  };
}

function validateCommandLog(value: unknown, path: string): Command[] {
  if (!Array.isArray(value)) {
    fail(path, 'an array of commands', value);
  }
  return value.map((entry: unknown, i) => {
    const record = asRecord(entry, `${path}[${i}]`);
    const type = asString(record['type'], `${path}[${i}].type`);
    if (!isKnownCommand(type)) {
      fail(`${path}[${i}].type`, 'a known command type', type);
    }
    return { type } as Command;
  });
}

// ---------------------------------------------------------------------------
// Load pipeline: migrate, then validate
// ---------------------------------------------------------------------------

/**
 * Runs the migration chain from the raw save's version up to SAVE_VERSION,
 * then structurally validates the result. Throws SaveLoadError with a clear
 * message on a newer-than-supported save or any shape mismatch.
 */
export function migrateAndValidateSave(raw: unknown): SaveGame {
  const record = asRecord(raw, 'save');
  const version = asInt(record['saveVersion'], 'save.saveVersion');
  if (version > SAVE_VERSION) {
    throw new SaveLoadError(
      `This save has saveVersion ${version}, but this engine supports at most ` +
        `${SAVE_VERSION}. It was created by a newer engine — upgrade to load it.`,
    );
  }
  if (version < 0) {
    fail('save.saveVersion', 'a non-negative integer', version);
  }
  let migrated: unknown = raw;
  for (let v = version; v < SAVE_VERSION; v++) {
    const step = migrations[v];
    if (step === undefined) {
      throw new SaveLoadError(
        `No migration registered for saveVersion ${v} → ${v + 1}; cannot load.`,
      );
    }
    migrated = step(migrated);
  }
  const final = asRecord(migrated, 'save');
  const snapshot = validateSnapshot(final['snapshot'], 'save.snapshot');
  const seed = asUint32(final['seed'], 'save.seed');
  const commandLog = validateCommandLog(final['commandLog'], 'save.commandLog');
  const turnHashes = validateTurnHashes(final['turnHashes'], 'save.turnHashes');
  // Cross-field consistency: the envelope seed and the snapshot seed are the
  // same fact recorded twice — a mismatch means the save was corrupted or
  // hand-edited, and replay-from-seed would silently diverge from the
  // snapshot.
  if (seed !== snapshot.seed) {
    throw new SaveLoadError(
      `Invalid save: save.seed ${seed} does not match save.snapshot.seed ${snapshot.seed}`,
    );
  }
  // One hash is recorded per EndTurn, so the chain length must equal the
  // number of EndTurn commands in the log.
  const endTurnCount = commandLog.filter((cmd) => cmd.type === 'EndTurn').length;
  if (turnHashes.length !== endTurnCount) {
    throw new SaveLoadError(
      `Invalid save: save.turnHashes has ${turnHashes.length} entries but ` +
        `save.commandLog contains ${endTurnCount} EndTurn commands`,
    );
  }
  return {
    saveVersion: SAVE_VERSION,
    engineVersion: asString(final['engineVersion'], 'save.engineVersion'),
    contentHash:
      final['contentHash'] === undefined
        ? CONTENT_HASH_PLACEHOLDER
        : asString(final['contentHash'], 'save.contentHash'),
    seed,
    snapshot,
    commandLog,
    turnHashes,
  };
}
