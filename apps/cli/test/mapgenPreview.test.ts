import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generatePreview, parsePreviewArgs } from '../src/mapgen-preview';

const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

describe('mapgen-preview PNG', () => {
  it('same seed ⇒ byte-identical PNG (hashes equal)', () => {
    const a = generatePreview(7, 'duel');
    const b = generatePreview(7, 'duel');
    expect(sha256(a)).toBe(sha256(b));
  });

  it('different seeds ⇒ different PNGs', () => {
    expect(sha256(generatePreview(1, 'duel'))).not.toBe(sha256(generatePreview(2, 'duel')));
  });

  it('produces a real PNG with the expected dimensions', () => {
    const buffer = generatePreview(3, 'duel'); // 56×36 tiles → 452×252 px
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(buffer.readUInt32BE(16)).toBe(56 * 8 + 4); // IHDR width
    expect(buffer.readUInt32BE(20)).toBe(36 * 7); // IHDR height
  });
});

describe('mapgen-preview args', () => {
  it('defaults and explicit values', () => {
    expect(parsePreviewArgs([])).toEqual({
      seed: 7,
      size: 'standard',
      out: 'map-seed7-standard.png',
    });
    expect(parsePreviewArgs(['--seed', '9', '--size', 'huge', '--out', 'x.png'])).toEqual({
      seed: 9,
      size: 'huge',
      out: 'x.png',
    });
  });

  it('rejects bad sizes and seeds', () => {
    expect(() => parsePreviewArgs(['--size', 'giant'])).toThrow(/--size must be one of/);
    expect(() => parsePreviewArgs(['--seed', '-3'])).toThrow(/--seed/);
    expect(() => parsePreviewArgs(['--flag'])).toThrow(/unknown argument/);
  });
});
