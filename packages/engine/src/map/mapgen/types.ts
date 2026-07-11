/**
 * Mapgen pipeline types (doc 04 §4). Stages are pure functions over a shared
 * MapgenContext: they read what earlier stages wrote and write their own
 * outputs, drawing randomness ONLY from the Pcg32 substream handed to them
 * (bound to `mapgen:<stage>` by the pipeline runner in index.ts), so a new
 * draw in one stage can never shift another stage.
 */

import type { Pcg32 } from '../../rng/pcg32';
import type { MapState } from '../grid';

export interface MapgenContext {
  readonly width: number;
  readonly height: number;
  /** The MapState being filled (terrain/feature/elevation/resource/riverEdges). */
  readonly map: MapState;
  // -- Intermediate fields (never serialized; rebuildable, doc 04 §3.1) --
  /** 1 = land. Written by landmass; rivers clears bits when carving lakes. */
  readonly landMask: Uint8Array;
  /** Raw 16-bit continent heightfield from the landmass noise. */
  readonly heightField: Uint16Array;
  /** Hex distance to the nearest water tile, capped at 255 (elevation stage). */
  readonly distToWater: Uint8Array;
  /** 0..255 temperature (climate stage). */
  readonly temperature: Uint8Array;
  /** 0..255 moisture (climate stage). */
  readonly moisture: Uint8Array;
}

export interface MapgenStage {
  /** Short stage name; its RNG substream is `mapgen:<name>`. */
  readonly name: string;
  run(ctx: MapgenContext, stream: Pcg32): void;
}

/** Thrown by the validation stage with per-check diagnostics. */
export class MapgenValidationError extends Error {
  readonly diagnostics: readonly string[];

  constructor(message: string, diagnostics: readonly string[]) {
    super(`${message}\n  ${diagnostics.join('\n  ')}`);
    this.name = 'MapgenValidationError';
    this.diagnostics = diagnostics;
  }
}
