import { describe, expect, it } from 'vitest';
import { fnv1a64HexBytes } from '@civ8/engine';
import { renderMapPngBuffer } from '../src/mapgenPreview';

describe('mapgen-preview PNG determinism (AC1)', () => {
  it('same seed + size ⇒ byte-identical PNG (hash compared)', () => {
    const first = renderMapPngBuffer(7, 'duel');
    const second = renderMapPngBuffer(7, 'duel');
    expect(first.length).toBe(second.length);
    expect(fnv1a64HexBytes(first)).toBe(fnv1a64HexBytes(second));
    expect(first.equals(second)).toBe(true);
  });

  it('different seeds ⇒ different PNGs', () => {
    const a = renderMapPngBuffer(7, 'duel');
    const b = renderMapPngBuffer(8, 'duel');
    expect(a.equals(b)).toBe(false);
  });

  it('the PNG is a real PNG with the expected dimensions', () => {
    const buffer = renderMapPngBuffer(7, 'duel');
    // PNG signature.
    expect([...buffer.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR width/height (big-endian at offsets 16/20): duel is 56x36 hexes.
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    expect(width).toBeGreaterThan(56 * 10); // ~sqrt(3)*R per column, R=6
    expect(height).toBeGreaterThan(36 * 8);
  });
});
