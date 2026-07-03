# Determinism contract

Everything observable in a Civilization VIII game is a pure function of
`(seed, commandLog)`. Two machines that execute the same commands from the
same seed must produce byte-identical state — that is what makes replays,
golden logs, save verification, undo (M6), and future multiplayer lockstep
possible. This document is the contract; the enforcement machinery at the end
is what keeps it honest.

## The rules

### 1. Randomness: PCG32 substreams only

- The engine's only randomness source is PCG32 (`rng/pcg32.ts`), implemented
  in 32-bit integer ops (`Math.imul`, `>>>`) — no BigInt in hot paths.
- All draws go through **named substreams** (`GameRng.stream('turn')`,
  later `'mapgen'`, `'combat'`, `'ai:<player>'`), each seeded via
  `splitmix32(masterSeed XOR fnv1a32(name))`. Adding a draw to one stream
  never shifts any other stream, so golden hashes stay stable across
  unrelated changes.
- Substream positions are part of serialized state: they are captured into
  `GameState.rng` before every hash/snapshot and restored exactly on load.
- Banned in `packages/engine` and `packages/ai` (lint-enforced):
  `Math.random`, `Date.now`, `performance.now`, `crypto.getRandomValues`,
  `new Date()`.

### 2. Numbers: integer math only

- All game quantities are **scaled integers** (movement in sixtieths, yields
  ×100). No floats in rules code; float results differ across platforms and
  optimization tiers, integers do not.
- 64-bit work (PCG32 state, FNV-1a 64 hashing) is done on 32-/16-bit limbs
  with `Math.imul` and `>>>`; every intermediate stays below 2^53 so each
  step is bit-exact in doubles.
- `canonicalStringify` rejects non-finite numbers outright — NaN/Infinity can
  never enter serialized state.

### 3. Iteration order: sorted, always

- Keyed collections live behind `SortedMap`, which guarantees ascending
  numeric-ID iteration for `keys()`/`values()`/`entries()` regardless of
  insertion order — the #1 nondeterminism source in JS, killed at the type
  level.
- `for...in` and raw `Object.keys()` are lint-banned in engine/ai;
  `sortedKeys()` (`serialize/canonical.ts`) is the only sanctioned door for
  object-key enumeration.
- Canonical serialization (`canonicalStringify`) emits object keys sorted, so
  the same logical state is always the same bytes; its 64-bit FNV-1a hash
  (`hashState`) is the determinism checksum.

### 4. State and commands

- The `Game` facade is the single write entry point. Command handlers
  (`commands/registry.ts`) validate before mutating; rejected commands must
  leave state untouched and are never logged.
- The initial state is a pure function of the seed (`createInitialState`) —
  replay depends on this.
- Derived caches are rebuildable, never serialized, and never sources of
  truth.
- Every executed command is recorded; every `EndTurn` appends to the
  per-EndTurn hash chain (`Game.turnHashes`) used for desync forensics.

## Enforcement

Four independent nets, all in `pnpm run ci`:

1. **Property tests** (fast-check, `packages/engine/test/*.property.test.ts`):
   - *Replay identity* (500 runs): arbitrary seed, 0–50 EndTurns, run twice
     and via `Game.replay` ⇒ identical hash chains.
   - *Save/load transparency* (250 runs): N commands, snapshot, load (through
     a JSON round-trip), M more commands on both ⇒ identical hashes, chains,
     and logs.
   - *Canonical round-trip + key-order independence* (500 runs each).
   - *SortedMap order invariance* under arbitrary insertion orders (500 runs).
2. **Golden logs** (`test-fixtures/golden-logs/`): committed recorded runs
   `{seed, commandLog, expectedTurnHashes, expectedFinalHash}`. A vitest
   suite (`apps/cli/test/goldenLogs.test.ts`) replays every fixture; the
   `replay` CLI (`pnpm replay -- <fixture.json>`) does the same standalone
   and exits nonzero with a clear message on any mismatch.
3. **CI determinism double-run** (`pnpm determinism`): runs
   `sim --seed 1 --max-turns 10` twice and diffs the full JSON output —
   byte-identical or the build fails.
4. **Static walls**: ESLint bans the nondeterminism APIs above;
   dependency-cruiser enforces zero runtime deps and no DOM/renderer imports
   in the engine; `tsc --strict` everywhere.

## Updating golden logs

Golden hashes change only when the simulation intentionally changes (new
rules, state shape, or RNG consumption). The procedure:

1. Make the engine change; run `pnpm test` and see exactly the golden-log
   suite fail (property tests must still pass — if they fail, determinism
   itself is broken, do not regenerate).
2. Run `pnpm goldens:update` (regenerates every fixture in
   `test-fixtures/golden-logs/` from the current engine).
3. Inspect the diff and explain the hash change in the commit message.
   An unexplained golden diff must never be merged.
4. `pnpm run ci` green.

Never hand-edit fixture files.
