/**
 * Map sizes (doc 02 §2.1): Duel 56×36 … Huge 128×80. The size name is part
 * of game genesis (seed + size + command log ⇒ everything), so it is stored
 * in GameState and in saves.
 */

export type MapSizeName = 'duel' | 'small' | 'standard' | 'large' | 'huge';

export interface MapDimensions {
  readonly width: number;
  readonly height: number;
}

/** Explicit list — the deterministic iteration order for size-keyed loops. */
export const MAP_SIZE_NAMES: readonly MapSizeName[] = [
  'duel',
  'small',
  'standard',
  'large',
  'huge',
];

export const MAP_SIZES: Readonly<Record<MapSizeName, MapDimensions>> = {
  duel: { width: 56, height: 36 },
  small: { width: 72, height: 46 },
  standard: { width: 92, height: 60 },
  large: { width: 110, height: 70 },
  huge: { width: 128, height: 80 },
};

/** M1 saves had no map; migrated v0 games and default creates use Duel. */
export const DEFAULT_MAP_SIZE: MapSizeName = 'duel';

export function isMapSizeName(value: string): value is MapSizeName {
  return (MAP_SIZE_NAMES as readonly string[]).includes(value);
}
