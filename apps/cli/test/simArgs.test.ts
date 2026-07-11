import { describe, expect, it } from 'vitest';
import { MAX_SEED, MAX_TURNS, parseSimArgs, SimArgError } from '../src/simArgs';

describe('parseSimArgs', () => {
  it('defaults to seed 1, maxTurns 10', () => {
    expect(parseSimArgs([])).toEqual({ kind: 'run', args: { seed: 1, maxTurns: 10 } });
  });

  it('parses --seed and --max-turns in any order', () => {
    expect(parseSimArgs(['--seed', '42', '--max-turns', '25'])).toEqual({
      kind: 'run',
      args: { seed: 42, maxTurns: 25 },
    });
    expect(parseSimArgs(['--max-turns', '3', '--seed', '0'])).toEqual({
      kind: 'run',
      args: { seed: 0, maxTurns: 3 },
    });
  });

  it('ignores the pnpm "--" separator', () => {
    expect(parseSimArgs(['--', '--seed', '7'])).toEqual({
      kind: 'run',
      args: { seed: 7, maxTurns: 10 },
    });
  });

  it('accepts the 32-bit boundary values', () => {
    expect(parseSimArgs(['--seed', String(MAX_SEED)])).toEqual({
      kind: 'run',
      args: { seed: MAX_SEED, maxTurns: 10 },
    });
    expect(parseSimArgs(['--max-turns', String(MAX_TURNS)])).toEqual({
      kind: 'run',
      args: { seed: 1, maxTurns: MAX_TURNS },
    });
  });

  it('returns help for --help / -h', () => {
    expect(parseSimArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseSimArgs(['-h'])).toEqual({ kind: 'help' });
  });

  it('rejects missing values with a clear message', () => {
    expect(() => parseSimArgs(['--seed'])).toThrow(SimArgError);
    expect(() => parseSimArgs(['--seed'])).toThrow(/missing value for --seed/);
    expect(() => parseSimArgs(['--max-turns'])).toThrow(/missing value for --max-turns/);
  });

  it('rejects non-integer, negative, and out-of-range values', () => {
    expect(() => parseSimArgs(['--seed', 'abc'])).toThrow(SimArgError);
    expect(() => parseSimArgs(['--seed', '1.5'])).toThrow(/non-negative integer/);
    expect(() => parseSimArgs(['--seed', '-1'])).toThrow(/non-negative integer/);
    expect(() => parseSimArgs(['--seed', String(MAX_SEED + 1)])).toThrow(/at most 4294967295/);
    expect(() => parseSimArgs(['--max-turns', String(MAX_TURNS + 1)])).toThrow(/at most 1000000/);
  });

  it('rejects unknown arguments', () => {
    expect(() => parseSimArgs(['--nope'])).toThrow(/unknown argument "--nope"/);
  });
});
