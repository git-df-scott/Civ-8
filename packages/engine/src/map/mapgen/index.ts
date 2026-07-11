/**
 * The mapgen pipeline (doc 04 §4): pure, individually snapshot-testable
 * stages, each drawing ONLY from its own named RNG substream
 * (`mapgen:<stage>`), so changing one stage never shifts another — golden
 * map hashes stay stable across unrelated stage changes.
 *
 * landmass → elevation/ridges → climate bands → biome lookup → downhill
 * river tracing with lakes → features → quota resources → validation.
 * (Start-position fairness is deliberately absent until M5 — needs civs.)
 */

import type { GameRng } from '../../rng/gameRng';
import type { MapState } from '../grid';
import { MAP_SIZES, type MapSizeName } from '../sizes';
import { assignBiomes } from './biomes';
import { generateClimate } from './climate';
import { generateElevation } from './elevation';
import { generateLandmass } from './landmass';
import { placeFeatures } from './features';
import { placeResources } from './resources';
import { traceRivers } from './rivers';
import { validateMap } from './validate';

export { MapgenValidationError, computeDiagnostics, type MapgenDiagnostics } from './validate';

/** Generates and validates a full map. Deterministic in (rng master seed, size). */
export function generateMap(rng: GameRng, size: MapSizeName): MapState {
  const { width, height } = MAP_SIZES[size];
  const land = generateLandmass(width, height, rng.stream('mapgen:landmass'));
  const elevationRaw = generateElevation(width, height, land, rng.stream('mapgen:elevation'));
  const climate = generateClimate(width, height, land, elevationRaw, rng.stream('mapgen:climate'));
  const baseTerrain = assignBiomes(width, height, land, climate);
  const rivers = traceRivers(width, height, baseTerrain, elevationRaw, rng.stream('mapgen:rivers'));
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
  const map: MapState = {
    width,
    height,
    terrain: rivers.terrain,
    elevation: rivers.elevation,
    feature,
    resource,
    riverEdges: rivers.riverEdges,
  };
  validateMap(map);
  return map;
}
