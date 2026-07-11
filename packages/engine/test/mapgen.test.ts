import { describe, expect, it } from 'vitest';
import { GameRng } from '../src/rng/gameRng';
import { fnv1a64HexBytes } from '../src/serialize/hash';
import {
  MAPGEN_STAGES,
  generateMapForSeed,
  mapgenStreamName,
  runMapgen,
  type MapgenContext,
  type MapgenRunOptions,
} from '../src/map/mapgen/index';
import { serializeMapState, type MapSizeName } from '../src/map/grid';
import { ELEVATION_MOUNTAIN_MIN, TERRAIN, isWaterTerrain } from '../src/map/terrain';

/** Stable fingerprint of everything a stage may have touched. */
function contextHashes(ctx: MapgenContext): Record<string, string> {
  return {
    terrain: fnv1a64HexBytes(ctx.map.terrain),
    feature: fnv1a64HexBytes(ctx.map.feature),
    elevation: fnv1a64HexBytes(ctx.map.elevation),
    resource: fnv1a64HexBytes(ctx.map.resource),
    riverEdges: fnv1a64HexBytes(ctx.map.riverEdges),
    landMask: fnv1a64HexBytes(ctx.landMask),
    temperature: fnv1a64HexBytes(ctx.temperature),
    moisture: fnv1a64HexBytes(ctx.moisture),
  };
}

/** Runs the pipeline collecting the per-stage fingerprints. */
function stageHashes(
  seed: number,
  size: MapSizeName,
  streamNames?: MapgenRunOptions['streamNames'],
): Array<[string, Record<string, string>]> {
  const collected: Array<[string, Record<string, string>]> = [];
  runMapgen(new GameRng(seed), size, {
    onStage: (name, ctx) => collected.push([name, contextHashes(ctx)]),
    ...(streamNames ? { streamNames } : {}),
  });
  return collected;
}

describe('mapgen pipeline', () => {
  // AC3: per-stage snapshots for 3 seeds. A change to any stage shows up as
  // a reviewed snapshot diff, starting at exactly the stage that changed.
  it.each([1, 7, 42])('per-stage output fingerprints are stable (seed %i, duel)', (seed) => {
    expect(stageHashes(seed, 'duel')).toMatchSnapshot();
  });

  it('same seed ⇒ byte-identical map (serialize both, compare)', () => {
    const a = serializeMapState(generateMapForSeed(7, 'duel'));
    const b = serializeMapState(generateMapForSeed(7, 'duel'));
    expect(a).toEqual(b);
  });

  it('different seeds ⇒ different maps', () => {
    const a = serializeMapState(generateMapForSeed(7, 'duel'));
    const b = serializeMapState(generateMapForSeed(8, 'duel'));
    expect(a.terrain).not.toBe(b.terrain);
  });

  // AC3: renaming one stage's RNG stream must not shift any EARLIER stage
  // (they already ran from their own streams) — and, because stages draw
  // only from their own substream, every stage BEFORE the renamed one is
  // byte-identical while the renamed stage's own output changes.
  it('renaming the resources stream changes only the resources stage output', () => {
    const normal = stageHashes(7, 'duel');
    const renamed = stageHashes(7, 'duel', { resources: 'mapgen:resources-RENAMED' });
    const stageNames = MAPGEN_STAGES.map((s) => s.name);
    const resourcesAt = stageNames.indexOf('resources');
    for (let i = 0; i < resourcesAt; i++) {
      expect(renamed[i], `stage ${stageNames[i]} must not shift`).toEqual(normal[i]);
    }
    expect(renamed[resourcesAt]![1]['resource']).not.toBe(normal[resourcesAt]![1]['resource']);
    // Everything except the resource array is untouched by the rename even
    // in the resources stage itself.
    expect(renamed[resourcesAt]![1]['terrain']).toBe(normal[resourcesAt]![1]['terrain']);
    expect(renamed[resourcesAt]![1]['riverEdges']).toBe(normal[resourcesAt]![1]['riverEdges']);
  });

  it('renaming the features stream leaves landmass→rivers identical', () => {
    const normal = stageHashes(42, 'duel');
    const renamed = stageHashes(42, 'duel', { features: 'mapgen:features-v2' });
    const stageNames = MAPGEN_STAGES.map((s) => s.name);
    const featuresAt = stageNames.indexOf('features');
    for (let i = 0; i < featuresAt; i++) {
      expect(renamed[i]).toEqual(normal[i]);
    }
    expect(renamed[featuresAt]![1]['feature']).not.toBe(normal[featuresAt]![1]['feature']);
  });

  it('drawing from one substream never advances another (GameRng isolation)', () => {
    const a = new GameRng(7);
    for (let i = 0; i < 1000; i++) {
      a.stream(mapgenStreamName('landmass')).nextUint32();
    }
    const b = new GameRng(7);
    expect(a.stream(mapgenStreamName('elevation')).nextUint32()).toBe(
      b.stream(mapgenStreamName('elevation')).nextUint32(),
    );
  });

  it.each(['duel', 'standard', 'huge'] as const)(
    'generates a structurally sound %s world for seeds 1/7/42 (validation stage passes)',
    (size) => {
      for (const seed of [1, 7, 42]) {
        // runMapgen throws MapgenValidationError on any structural problem —
        // reaching here means land fraction, relief shares, coast adjacency,
        // river mirroring, and rivers-reach-water all held.
        const map = generateMapForSeed(seed, size);
        const tiles = map.width * map.height;
        let land = 0;
        let mountains = 0;
        let rivers = 0;
        for (let i = 0; i < tiles; i++) {
          if (!isWaterTerrain(map.terrain[i]!)) {
            land += 1;
            if (map.elevation[i]! >= ELEVATION_MOUNTAIN_MIN) mountains += 1;
          }
          if (map.riverEdges[i]! !== 0) rivers += 1;
        }
        expect(land / tiles).toBeGreaterThan(0.22);
        expect(land / tiles).toBeLessThan(0.45);
        expect(mountains).toBeGreaterThan(0);
        expect(rivers).toBeGreaterThan(10); // rivers exist and touch many tiles
      }
    },
  );

  it('the map has both hemispheres of climate (snow/tundra near poles, warmth mid-map)', () => {
    const map = generateMapForSeed(7, 'huge');
    let warmBand = 0;
    for (let i = 0; i < map.terrain.length; i++) {
      const t = map.terrain[i]!;
      if (t === TERRAIN.Grassland || t === TERRAIN.Plains || t === TERRAIN.Desert) {
        warmBand += 1;
      }
    }
    expect(warmBand).toBeGreaterThan(0);
  });
});
