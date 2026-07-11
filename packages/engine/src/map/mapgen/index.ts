/**
 * Mapgen pipeline (doc 04 §4): landmass → elevation → climate → biomes →
 * rivers → features → resources → validation. Pure and individually
 * snapshot-testable; each stage draws only from its own named substream
 * `mapgen:<stage>` so a new draw in one stage never shifts another
 * (docs/determinism.md §1). Start-position fairness is deliberately absent
 * until M5 (needs civs).
 */

import { GameRng } from '../../rng/gameRng';
import { MAP_SIZES, createEmptyMapState, type MapSizeName, type MapState } from '../grid';
import { biomesStage } from './biomes';
import { climateStage } from './climate';
import { elevationStage } from './elevation';
import { featuresStage } from './features';
import { landmassStage } from './landmass';
import { resourcesStage } from './resources';
import { riversStage } from './rivers';
import { validateStage } from './validate';
import type { MapgenContext, MapgenStage } from './types';

export { MapgenValidationError, type MapgenContext, type MapgenStage } from './types';
export { validateMapSemantics } from './validate';

export const MAPGEN_STAGES: readonly MapgenStage[] = [
  landmassStage,
  elevationStage,
  climateStage,
  biomesStage,
  riversStage,
  featuresStage,
  resourcesStage,
  validateStage,
];

/** The default substream name a stage draws from. */
export function mapgenStreamName(stageName: string): string {
  return `mapgen:${stageName}`;
}

/** Test seams: per-stage observation and substream-name overrides. */
export interface MapgenRunOptions {
  /** Called after each stage completes — per-stage snapshot tests hook here. */
  readonly onStage?: (stageName: string, ctx: MapgenContext) => void;
  /**
   * Stream-name override per stage name — the substream-isolation test
   * renames one stage's stream and proves the others don't shift.
   */
  readonly streamNames?: Readonly<Partial<Record<string, string>>>;
}

export function createMapgenContext(width: number, height: number): MapgenContext {
  const tiles = width * height;
  return {
    width,
    height,
    map: createEmptyMapState(width, height),
    landMask: new Uint8Array(tiles),
    heightField: new Uint16Array(tiles),
    distToWater: new Uint8Array(tiles),
    temperature: new Uint8Array(tiles),
    moisture: new Uint8Array(tiles),
  };
}

/**
 * Runs the full pipeline against `rng` (substream positions advance on the
 * caller's GameRng, so they serialize into saves) and returns the finished
 * MapState. Throws MapgenValidationError when the validation stage rejects
 * the world.
 */
export function runMapgen(rng: GameRng, size: MapSizeName, options?: MapgenRunOptions): MapState {
  const { width, height } = MAP_SIZES[size];
  const ctx = createMapgenContext(width, height);
  for (const stage of MAPGEN_STAGES) {
    const streamName = options?.streamNames?.[stage.name] ?? mapgenStreamName(stage.name);
    stage.run(ctx, rng.stream(streamName));
    options?.onStage?.(stage.name, ctx);
  }
  return ctx.map;
}

/**
 * Standalone map generation for tools (mapgen-preview, bench): same pipeline
 * and substreams as Game.create({ seed, mapSize }) — byte-identical output.
 */
export function generateMapForSeed(seed: number, size: MapSizeName): MapState {
  return runMapgen(new GameRng(seed >>> 0), size);
}
