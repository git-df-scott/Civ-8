import fc from 'fast-check';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '../src/serialize/base64';

describe('base64 (engine-own, environment-free)', () => {
  it('encodes exactly like Node Buffer and round-trips [property]', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        const encoded = bytesToBase64(bytes);
        expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
        expect([...base64ToBytes(encoded)]).toEqual([...bytes]);
      }),
      { numRuns: 500 },
    );
  });

  it('handles the empty array and all padding cases', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect([...base64ToBytes('')]).toEqual([]);
    expect(bytesToBase64(new Uint8Array([1]))).toBe('AQ==');
    expect(bytesToBase64(new Uint8Array([1, 2]))).toBe('AQI=');
    expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe('AQID');
  });

  it('strictly rejects malformed input (corrupt saves fail loudly)', () => {
    expect(() => base64ToBytes('AQI')).toThrow(/multiple of 4/); // bad length
    expect(() => base64ToBytes('AQ!=')).toThrow(/invalid character/);
    expect(() => base64ToBytes('A€==')).toThrow(/invalid character/); // >127 code unit
    expect(() => base64ToBytes('=AAA')).toThrow(/unexpected '='/); // '=' not padding
    expect(() => base64ToBytes('AB=A')).toThrow(/unexpected '='/); // '=' mid-group
    expect(() => base64ToBytes('AR==')).toThrow(/non-canonical/); // dirty padding bits
    expect(() => base64ToBytes('AQJ=')).toThrow(/non-canonical/);
  });
});
