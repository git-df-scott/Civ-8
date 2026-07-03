/**
 * Branded entity IDs (doc 04 §3.1).
 *
 * All entity IDs are numbers at runtime but distinct nominal types at compile
 * time, so a PlayerId can never be passed where a UnitId is expected. New ID
 * kinds (UnitId, CityId, TileIndex, …) are one-liners on top of `Branded`.
 */

declare const idBrand: unique symbol;

/** A number nominally tagged with the brand `B`. Zero runtime cost. */
export type Branded<B extends string> = number & { readonly [idBrand]: B };

/** Runtime guard shared by all ID constructors: IDs are non-negative integers. */
function assertId(value: number, kind: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${kind} must be a non-negative integer, got ${value}`);
  }
}

export type PlayerId = Branded<'PlayerId'>;

export function playerId(value: number): PlayerId {
  assertId(value, 'PlayerId');
  return value as PlayerId;
}
