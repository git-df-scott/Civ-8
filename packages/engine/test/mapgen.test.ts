import { describe, expect, it } from 'vitest';
import { GameRng } from '../src/rng/gameRng';
import { fnv1a64Hex } from '../src/serialize/hash';
import { bytesToBase64 } from '../src/serialize/base64';
import { MAP_SIZES } from '../src/map/sizes';
import { generateLandmass } from '../src/map/mapgen/landmass';
import { generateElevation } from '../src/map/mapgen/elevation';
import { generateClimate } from '../src/map/mapgen/climate';
import { assignBiomes } from '../src/map/mapgen/biomes';
import { traceRivers } from '../src/map/mapgen/rivers';
import { placeFeatures } from '../src/map/mapgen/features';
import { placeResources } from '../src/map/mapgen/resources';
import { computeDiagnostics, validateMap } from '../src/map/mapgen/validate';
import { generateMap } from '../src/map/mapgen/index';

const hash = (bytes: Uint8Array): string => fnv1a64Hex(bytesToBase64(bytes));

/**
 * Runs the pipeline stage by stage (exactly as generateMap wires it) and
 * records one hash per stage output. A changed hash pinpoints the earliest
 * stage whose behavior changed — the reviewed snapshot diff IS the change.
 */
function stageHashes(seed: number, size: 'duel' | 'small'): Record<string, string> {
  const { width, height } = MAP_SIZES[size];
  const rng = new GameRng(seed);
  const land = generateLandmass(width, height, rng.stream('mapgen:landmass'));
  const elevation = generateElevation(width, height, land, rng.stream('mapgen:elevation'));
  const climate = generateClimate(width, height, land, elevation, rng.stream('mapgen:climate'));
  const terrain = assignBiomes(width, height, land, climate);
  const rivers = traceRivers(width, height, terrain, elevation, rng.stream('mapgen:rivers'));
  const feature = placeFeatures(
    width,
    height,
    rivers.terrain,
    rivers.elevation,
    climate,
    rng.stream('mapgen:features'),
  );
  const resource = placeResources(
    width,
    height,
    rivers.terrain,
    rivers.elevation,
    feature,
    rng.stream('mapgen:resources'),
  );
  return {
    landmass: hash(land),
    elevation: hash(elevation),
    climateTemperature: hash(climate.temperature),
    climateMoisture: hash(climate.moisture),
    biomes: hash(terrain),
    riversTerrain: hash(rivers.terrain),
    riversEdges: hash(rivers.riverEdges),
    features: hash(feature),
    resources: hash(resource),
  };
}

describe('mapgen per-stage snapshots (3 seeds)', () => {
  // Golden per-stage hashes: an intentional stage change regenerates these
  // via `pnpm test -- -u` and the snapshot diff is reviewed; an accidental
  // change fails here naming the stage.
  for (const seed of [1, 7, 42]) {
    it(`seed ${seed} (duel) stage hashes are stable`, () => {
      expect(stageHashes(seed, 'duel')).toMatchSnapshot();
    });
  }
});

describe('mapgen determinism & validation', () => {
  it('same (seed, size) ⇒ byte-identical maps', () => {
    const a = generateMap(new GameRng(7), 'small');
    const b = generateMap(new GameRng(7), 'small');
    expect(a.terrain).toEqual(b.terrain);
    expect(a.elevation).toEqual(b.elevation);
    expect(a.feature).toEqual(b.feature);
    expect(a.resource).toEqual(b.resource);
    expect(a.riverEdges).toEqual(b.riverEdges);
  });

  it('different seeds ⇒ different maps', () => {
    const a = generateMap(new GameRng(1), 'duel');
    const b = generateMap(new GameRng(2), 'duel');
    expect(hash(a.terrain)).not.toBe(hash(b.terrain));
  });

  it('every size generates and validates with sane diagnostics', () => {
    for (const size of ['duel', 'small', 'standard', 'large', 'huge'] as const) {
      const map = generateMap(new GameRng(3), size);
      expect(map.width).toBe(MAP_SIZES[size].width);
      expect(map.height).toBe(MAP_SIZES[size].height);
      const diag = validateMap(map); // throws on any invariant violation
      expect(diag.landPer1000).toBeGreaterThanOrEqual(250);
      expect(diag.landPer1000).toBeLessThanOrEqual(450);
      expect(diag.mountainTiles).toBeGreaterThan(0);
      expect(diag.riverEdgeCount).toBeGreaterThan(0);
      expect(computeDiagnostics(map)).toEqual(diag);
    }
  });
});

describe('mapgen substream isolation (doc 04 §3.3)', () => {
  it('extra draws on one stage stream do not shift any earlier or unrelated stage', () => {
    const a = new GameRng(11);
    const b = new GameRng(11);
    // Simulate the features stage changing its draw count — the classic
    // shared-stream failure mode.
    const burned = b.stream('mapgen:features');
    for (let i = 0; i < 50; i++) {
      burned.nextUint32();
    }
    const mapA = generateMap(a, 'duel');
    const mapB = generateMap(b, 'duel');
    // Terrain, elevation, and rivers are computed from their own streams:
    // byte-identical despite the features perturbation.
    expect(mapB.terrain).toEqual(mapA.terrain);
    expect(mapB.elevation).toEqual(mapA.elevation);
    expect(mapB.riverEdges).toEqual(mapA.riverEdges);
    // The features stage itself DID shift (proves the burn was real)...
    expect(hash(mapB.feature)).not.toBe(hash(mapA.feature));
  });

  it('renaming a stage stream does not shift other stages given the same inputs', () => {
    const { width, height } = MAP_SIZES.duel;
    const a = new GameRng(9);
    const b = new GameRng(9);
    const landA = generateLandmass(width, height, a.stream('mapgen:landmass'));
    const landB = generateLandmass(width, height, b.stream('mapgen:landmass-renamed'));
    // The renamed stream reseeds landmass itself...
    expect(hash(landB)).not.toBe(hash(landA));
    // ...but feeding elevation the SAME land input yields identical output:
    // its 'mapgen:elevation' stream is untouched by the rename.
    const elevA = generateElevation(width, height, landA, a.stream('mapgen:elevation'));
    const elevB = generateElevation(width, height, landA, b.stream('mapgen:elevation'));
    expect(elevB).toEqual(elevA);
  });
});
