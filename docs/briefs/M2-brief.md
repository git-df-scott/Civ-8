# M2 implementation brief (agent prompt of record)

Milestone M2 "The world: mapgen & rendering" per docs/plan/05-roadmap.md M2
and docs/plan/04-technical-architecture.md §4 (map engineering) + §6 (UI
architecture) + §7 (performance budgets). Build on committed M0+M1. Do NOT
commit — orchestrator verifies, reviews, commits. Delete this file in the M2
commit.

## Scope (In)

1. **Hex math** (engine, `src/map/hex.ts`): axial coords (pointy-top, Red
   Blob conventions), cube conversion on demand (distance, lines), neighbor
   math through one `wrapQ()` helper for cylindrical east-west wrap.
   Branded `TileIndex` (`r * width + q`).
2. **Typed-array MapState** (engine, `src/map/grid.ts`): struct-of-typed-
   arrays per doc 04 §4 — terrain/feature/elevation/resource: Uint8Array;
   riverEdges: Uint8Array 6-edge bitmask. Integrated into GameState +
   canonical serialization (typed arrays → base64) + save validation +
   migration (SAVE_VERSION bump 0→1 with a real migration entry and a
   golden-save fixture for v0 per doc 04 §3.4 — the first entry in
   test-fixtures/golden-saves/).
3. **Mapgen pipeline** (engine, `src/map/mapgen/`): pure, individually
   snapshot-testable stages, each under `rng.stream('mapgen:<stage>')`:
   landmass (own integer-seeded value-noise impl ~80 lines, no float-seeded
   npm libs) → elevation/ridges → climate bands (latitude × moisture) →
   biome lookup table → downhill river tracing with lakes (rivers on edges)
   → features (forest/jungle/marsh) → quota-based resources → validation
   asserts with stage diagnostics. Sizes from doc 02 §2.1 (Duel 56×36 …
   Huge 128×80). Terrain/feature/resource tables as engine-internal
   constants for now (content-pack wiring is M4+; note the seam).
4. **Chunked Pixi terrain rendering** (apps/game): 16×16-hex chunks baked
   to RenderTextures, re-baked only on tile-change events, camera-culled;
   pan/zoom camera with inertial scrolling in one `camera.ts`; NO per-frame
   allocations in the render loop; precompute unit-hexagon corner offsets
   once at module load (M0 review carry-over). New game boots into a
   generated map (fixed seed via URL param `?seed=`).
5. **mapgen-preview PNG tool** (apps/cli, `mapgen-preview.ts`): seed +
   size → PNG (pngjs dependency is fine in cli; never in engine). Root
   script `pnpm mapgen`.
6. **Per-stage mapgen snapshots**: vitest snapshot (or hash-per-stage
   fixture) tests for 3 seeds — each stage's output hash recorded so a
   stage change is a reviewed diff. Same-seed ⇒ byte-identical PNG test
   (hash the PNG buffer).
7. **`bench.ts`** (apps/cli) + root `pnpm bench`: mapgen time per size and
   full-map serialization/hash time, JSON output; record the baseline in
   the report (budgets: huge mapgen < 3s, save serialize < 500ms).
8. **Pan-perf Playwright test**: scripted pan/zoom over a huge revealed map
   with Chrome tracing; assert < 5% dropped frames (doc 04 §7); record the
   baseline numbers. Keep the existing hexagon smoke test working or
   replace it with the map smoke (screenshot artifact stays).
9. **sim.ts arg-parse unit test** (small carry-over from M0 review).

## Out (explicit)

Start-position fairness pass (M5, needs civs), fog of war (M3), units
(M3), pathfinding (M3 — but keep grid API shaped so A* slots in), minimap,
content-pack-driven terrain data.

## Acceptance criteria

1. `pnpm mapgen -- --seed 7 --size huge --out map.png` produces a plausible
   continents map (landmasses, mountains ridges, rivers reaching seas,
   biome bands) — attach the PNG path; same seed twice ⇒ byte-identical PNG
   (hash shown).
2. Browser: new game renders the generated map; pan/zoom smooth; Playwright
   tracing test reports < 5% dropped frames on huge map (numbers reported).
3. Per-stage snapshot tests pass for 3 seeds; changing a stage's RNG stream
   name does NOT shift other stages (test proves substream isolation).
4. `pnpm run ci` fully green including new tests; determinism double-run
   still byte-identical (report new seed-1 final hash — map state changes
   it, expected); goldens regenerated intentionally.
5. v0 golden save loads via the new migration and replays (test).
6. `pnpm bench` runs and reports mapgen/serialize timings within budgets
   (report the numbers).

Constraints: engine stays pure/zero-runtime-deps (pngjs only in cli); all
mapgen math integer/fixed-point via engine RNG substreams — the eslint and
depcruise gates will catch violations; Playwright browsers pre-installed
(never `playwright install` locally; CI installs its own).
