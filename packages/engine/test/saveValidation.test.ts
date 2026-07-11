import { describe, expect, it } from 'vitest';
import {
  ELEVATION_LAND_MIN,
  Game,
  RESOURCE,
  SaveLoadError,
  TERRAIN,
  deserializeMapState,
  isKnownCommand,
  isWaterTerrain,
  runEndTurns,
  serializeMapState,
  validateTurnHashes,
  type SerializedMapState,
} from '../src/index';

/** A JSON-round-tripped save after `turns` EndTurns — a real on-disk shape. */
function rawSave(seed: number, turns: number): Record<string, unknown> {
  const game = Game.create({ seed });
  runEndTurns(game, turns);
  return JSON.parse(JSON.stringify(game.snapshot())) as Record<string, unknown>;
}

describe('save validation', () => {
  it("a '__proto__' RNG stream key fails with a clean SaveLoadError (never silently vanishes)", () => {
    const raw = rawSave(3, 2);
    const snapshot = raw['snapshot'] as { rng: Record<string, unknown> };
    const pcgState = JSON.stringify(snapshot.rng['turn']);
    // JSON.parse creates '__proto__' as a real own key — exactly what a
    // corrupt or hostile save file would contain. On a plain object,
    // `states['__proto__'] = ...` would hit the prototype setter and the
    // stream would silently disappear; the loader must reject it instead.
    snapshot.rng = JSON.parse(`{"__proto__": ${pcgState}, "turn": ${pcgState}}`) as Record<
      string,
      unknown
    >;
    // premise: '__proto__' really is an own key on the parsed object
    expect(Object.prototype.hasOwnProperty.call(snapshot.rng, '__proto__')).toBe(true);
    expect(() => Game.load(raw)).toThrow(SaveLoadError);
    expect(() => Game.load(raw)).toThrow(/__proto__/);
  });

  it('a dangling activePlayer (not a member of players) fails with a clean SaveLoadError', () => {
    const raw = rawSave(5, 3);
    (raw['snapshot'] as { activePlayer: number }).activePlayer = 99;
    expect(() => Game.load(raw)).toThrow(SaveLoadError);
    expect(() => Game.load(raw)).toThrow(/activePlayer 99/);
  });

  it('a top-level seed that disagrees with the snapshot seed fails with a clean SaveLoadError', () => {
    const raw = rawSave(7, 2);
    raw['seed'] = 8;
    expect(() => Game.load(raw)).toThrow(SaveLoadError);
    expect(() => Game.load(raw)).toThrow(/save\.seed 8 does not match save\.snapshot\.seed 7/);
  });

  it('a turnHashes count that disagrees with the EndTurn count fails with a clean SaveLoadError', () => {
    const short = rawSave(9, 4);
    (short['turnHashes'] as string[]).pop();
    expect(() => Game.load(short)).toThrow(SaveLoadError);
    expect(() => Game.load(short)).toThrow(/3 entries.*4 EndTurn commands/);

    const long = rawSave(9, 4);
    (long['turnHashes'] as string[]).push('0123456789abcdef');
    expect(() => Game.load(long)).toThrow(SaveLoadError);
    expect(() => Game.load(long)).toThrow(/5 entries.*4 EndTurn commands/);
  });

  it('a consistent save still loads cleanly (checks are not over-strict)', () => {
    const game = Game.create({ seed: 11 });
    runEndTurns(game, 5);
    const loaded = Game.load(JSON.parse(JSON.stringify(game.snapshot())));
    expect(loaded.hash()).toBe(game.hash());
  });

  it(
    'a save with a resource placed on an ocean tile fails to load ' +
      '(reuses mapgen semantic validation)',
    () => {
      const raw = rawSave(13, 0);
      const snapshot = raw['snapshot'] as { map: SerializedMapState };
      const map = deserializeMapState(snapshot.map);
      const oceanIndex = map.terrain.findIndex((t) => t === TERRAIN.Ocean);
      // Premise: a standard-size map has at least one true Ocean tile.
      expect(oceanIndex).toBeGreaterThanOrEqual(0);
      // Structurally this is a perfectly legal byte (a real resource id in
      // range) — only mapgen's own placement-legality rule (every resource
      // rule requires land) can catch it.
      map.resource[oceanIndex] = RESOURCE.Wheat;
      snapshot.map = serializeMapState(map);
      expect(() => Game.load(raw)).toThrow(SaveLoadError);
      expect(() => Game.load(raw)).toThrow(/resource/i);
    },
  );

  it(
    "a save with a land tile's elevation below the land minimum fails to load " +
      '(reuses mapgen semantic validation)',
    () => {
      const raw = rawSave(13, 0);
      const snapshot = raw['snapshot'] as { map: SerializedMapState };
      const map = deserializeMapState(snapshot.map);
      const landIndex = map.terrain.findIndex((t) => !isWaterTerrain(t));
      expect(landIndex).toBeGreaterThanOrEqual(0);
      // Still a structurally legal byte (0..255) — only mapgen's elevation
      // bound check can catch it.
      map.elevation[landIndex] = ELEVATION_LAND_MIN - 1;
      snapshot.map = serializeMapState(map);
      expect(() => Game.load(raw)).toThrow(SaveLoadError);
      expect(() => Game.load(raw)).toThrow(/elevation/i);
    },
  );
});

describe('shared validation helpers (save/validation)', () => {
  it('validateTurnHashes accepts 16-char lowercase hex and rejects anything else', () => {
    expect(validateTurnHashes(['0123456789abcdef'], 'x')).toEqual(['0123456789abcdef']);
    expect(() => validateTurnHashes('nope', 'x')).toThrow(SaveLoadError);
    expect(() => validateTurnHashes([42], 'x')).toThrow(/x\[0]/);
    expect(() => validateTurnHashes(['0123456789ABCDEF'], 'x')).toThrow(/lowercase hex/);
    expect(() => validateTurnHashes(['0123456789abcde'], 'x')).toThrow(/16-char/);
  });

  it('isKnownCommand is driven off the command registry', () => {
    expect(isKnownCommand('EndTurn')).toBe(true);
    expect(isKnownCommand('Nonsense')).toBe(false);
    expect(isKnownCommand('')).toBe(false);
  });
});
