import { describe, expect, it } from 'vitest';
import { Pcg32, fnv1a32, splitmix32 } from '../src/rng/pcg32';
import { u64 } from '../src/internal/u64';

describe('Pcg32', () => {
  it('matches the PCG reference known-answer vector (seed 42, seq 54)', () => {
    // First outputs of the canonical pcg32-demo (O'Neill reference implementation)
    // after pcg32_srandom_r(&rng, 42u, 54u).
    const rng = Pcg32.seeded(u64(0, 42), u64(0, 54));
    const expected = [0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e];
    const actual = expected.map(() => rng.nextUint32());
    expect(actual).toEqual(expected);
  });

  it('produces a stable substream sequence for a fixed (seed, name)', () => {
    // Frozen golden values: if these change, every golden master in the repo
    // is invalidated. Do not update casually.
    const golden = [3132848459, 2385032920, 3517215964, 1481001216];
    const rng = Pcg32.stream(1, 'turn');
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toEqual(
      golden,
    );
  });

  it('gives independent substreams: different names diverge, and drawing from one does not shift another', () => {
    const a1 = Pcg32.stream(123, 'combat');
    const b1 = Pcg32.stream(123, 'mapgen');
    const seqA = [a1.nextUint32(), a1.nextUint32(), a1.nextUint32()];
    const seqB = [b1.nextUint32(), b1.nextUint32(), b1.nextUint32()];
    expect(seqA).not.toEqual(seqB);

    // Interleaving draws from 'combat' must not change what 'mapgen' produces.
    const a2 = Pcg32.stream(123, 'combat');
    const b2 = Pcg32.stream(123, 'mapgen');
    const interleaved: number[] = [];
    for (let i = 0; i < 3; i++) {
      a2.nextUint32();
      a2.nextUint32(); // extra combat draws
      interleaved.push(b2.nextUint32());
    }
    expect(interleaved).toEqual(seqB);
  });

  it('different master seeds give different streams for the same name', () => {
    const a = Pcg32.stream(1, 'turn');
    const b = Pcg32.stream(2, 'turn');
    expect([a.nextUint32(), a.nextUint32()]).not.toEqual([b.nextUint32(), b.nextUint32()]);
  });

  it('round-trips through getState/fromState', () => {
    const rng = Pcg32.stream(7, 'turn');
    rng.nextUint32();
    rng.nextUint32();
    const resumed = Pcg32.fromState(rng.getState());
    expect([resumed.nextUint32(), resumed.nextUint32()]).toEqual([
      rng.nextUint32(),
      rng.nextUint32(),
    ]);
  });

  it('nextBounded stays in range and is deterministic', () => {
    const rng = Pcg32.stream(9, 'test');
    const values = Array.from({ length: 1000 }, () => rng.nextBounded(6));
    expect(values.every((v) => Number.isInteger(v) && v >= 0 && v < 6)).toBe(true);
    const rng2 = Pcg32.stream(9, 'test');
    expect(Array.from({ length: 1000 }, () => rng2.nextBounded(6))).toEqual(values);
  });

  it('fnv1a32 and splitmix32 are stable', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('turn')).toBe(fnv1a32('turn'));
    expect(fnv1a32('turn')).not.toBe(fnv1a32('combat'));
    const next = splitmix32(0);
    const seq = [next(), next()];
    const next2 = splitmix32(0);
    expect([next2(), next2()]).toEqual(seq);
    expect(seq[0]).not.toBe(seq[1]);
  });
});
