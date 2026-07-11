import { describe, expect, it } from 'vitest';
import { MAX_SEED, MAX_TURNS, SimUsageError, parseSimArgs } from '../src/simArgs';

describe('sim argument parsing (M0-review carry-over)', () => {
  it('defaults to seed 1, 10 turns', () => {
    expect(parseSimArgs([])).toEqual({ seed: 1, maxTurns: 10, help: false });
  });

  it('parses --seed and --max-turns in any order', () => {
    expect(parseSimArgs(['--seed', '42', '--max-turns', '25'])).toEqual({
      seed: 42,
      maxTurns: 25,
      help: false,
    });
    expect(parseSimArgs(['--max-turns', '0', '--seed', '0'])).toEqual({
      seed: 0,
      maxTurns: 0,
      help: false,
    });
  });

  it('skips the literal "--" separator pnpm forwards', () => {
    expect(parseSimArgs(['--', '--seed', '3'])).toEqual({ seed: 3, maxTurns: 10, help: false });
  });

  it('accepts the extremes and rejects one past them', () => {
    expect(parseSimArgs(['--seed', String(MAX_SEED)]).seed).toBe(MAX_SEED);
    expect(parseSimArgs(['--max-turns', String(MAX_TURNS)]).maxTurns).toBe(MAX_TURNS);
    expect(() => parseSimArgs(['--seed', String(MAX_SEED + 1)])).toThrow(/at most 4294967295/);
    expect(() => parseSimArgs(['--max-turns', String(MAX_TURNS + 1)])).toThrow(/at most 1000000/);
  });

  it('rejects missing values, non-integers, and negatives with clear messages', () => {
    expect(() => parseSimArgs(['--seed'])).toThrow(SimUsageError);
    expect(() => parseSimArgs(['--seed'])).toThrow(/missing value for --seed/);
    expect(() => parseSimArgs(['--max-turns'])).toThrow(/missing value for --max-turns/);
    expect(() => parseSimArgs(['--seed', 'x'])).toThrow(/non-negative integer/);
    expect(() => parseSimArgs(['--seed', '1.5'])).toThrow(/non-negative integer/);
    expect(() => parseSimArgs(['--seed', '-1'])).toThrow(/non-negative integer/);
  });

  it('rejects unknown arguments', () => {
    expect(() => parseSimArgs(['--nope'])).toThrow(/unknown argument "--nope"/);
    expect(() => parseSimArgs(['7'])).toThrow(/unknown argument "7"/);
  });

  it('--help/-h short-circuits without validating the rest', () => {
    expect(parseSimArgs(['--help'])).toEqual({ seed: 1, maxTurns: 10, help: true });
    expect(parseSimArgs(['--seed', '5', '-h'])).toEqual({ seed: 5, maxTurns: 10, help: true });
  });

  it('a value that looks like a flag is consumed as the value (documented quirk)', () => {
    // '--seed --max-turns' reads '--max-turns' as the seed value and fails
    // on integer parsing — a clear message, not silent misparsing.
    expect(() => parseSimArgs(['--seed', '--max-turns', '5'])).toThrow(/non-negative integer/);
  });
});
