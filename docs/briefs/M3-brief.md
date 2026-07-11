# M3 implementation brief (agent prompt of record)

Milestone M3 "Units, movement, fog" per docs/plan/05-roadmap.md M3 and
docs/plan/04-technical-architecture.md §4 (map/pathfinding/fog) + §2 (repo
layout — note the `content-schemas` boundary rule below). Build on committed
M0+M1+M2 (engine, mapgen, chunked renderer all working). Do NOT commit —
orchestrator verifies, reviews, commits. Delete this file in the M3 commit.

## Content boundary (read this first — it's load-bearing)

`packages/content` is still a placeholder (`CONTENT_PACKAGE_PLACEHOLDER`).
Doc 04 §2 sanctions exactly one engine↔content edge: **engine may
type-only-import from content/schemas; content depends on nothing; the
engine must stay zero-runtime-deps** (dependency-cruiser already enforces
this — see `engine-content-type-only` in `.dependency-cruiser.cjs`, built
in M1). Concretely for M3:

- `packages/content`: add Zod (real dependency here, fine) schemas for
  `Unit` (id, name, movementPoints, class: 'land'|'naval', combat stats
  placeholder for M5) under `schemas/`; a `base/units.json` pack with
  `scout` (movement 2) and `warrior` (movement 1); a `loadContent()`
  function that validates and returns a frozen, typed content pack; a
  `contentHash()` over the pack (replaces engine's current
  `CONTENT_HASH_PLACEHOLDER` constant — wire this through `SaveGame`).
- `packages/engine`: defines its own runtime `UnitDef` shape (whatever
  fields movement/pathfinding actually need) and may `import type` the
  content package's inferred `Unit` type ONLY for compile-time structural
  checking — never a runtime import. Unit instances (UnitId, position,
  owner, movement remaining) are engine-owned live state; unit *definitions*
  (stats) are passed into `Game.create()` as plain data (the loaded content
  pack), not imported by the engine module graph.
- Verify the boundary the same way M0/M1 did: temporarily add a runtime
  `import { loadContent } from '@civ8/content'` inside engine src, show
  depcruise fails, then a `import type` version passes, then revert.

## Scope (In)

1. **Unit entities** (engine `src/state/`): branded `UnitId`; live `Unit`
   {id, defId, owner: PlayerId, tileIndex, movementRemaining} in a
   `SortedMap<UnitId, Unit>` on GameState (replacing the `units: null`
   placeholder — this is a state-shape change, bump SAVE_VERSION with a
   migration + golden-save fixture, same pattern as M2's v0→v1).
2. **MoveUnit command**: validate (unit exists, owned by issuer, target tile
   reachable within remaining movement, target not blocked), apply (consume
   movement via A* path cost, update tileIndex, emit `UnitMoved` event).
   Two starting units spawned near each player's start on `Game.create`
   (scout + warrior each, or similar — your call, document it) so there's
   something to move from turn 1.
3. **Pathfinding** (engine `src/map/pathfind.ts`): A* with a binary min-heap;
   data-driven per-movement-class costs (land unit cost per terrain type —
   define a simple cost table now, richer rules later); reachable-tiles as
   budgeted Dijkstra sharing the cost code. Both must respect the map's
   cylindrical wrap (`wrapQ`/`neighborIndex` from M2's hex.ts).
4. **Zone of control**: a per-player incrementally-maintained bitmask
   (doc 04 §4) — for M3 with no combat yet, ZOC only needs a real, tested
   implementation and integration into pathfinding neighbor expansion; full
   combat consequences arrive at M5. Unit-test table covering: entering a
   ZOC tile costs all remaining movement, moving between two ZOC tiles of
   the same hostile unit is blocked, friendly ZOC doesn't restrict friendly
   movement, ZOC updates when the exerting unit moves.
5. **Fog of war** (engine `src/map/visibility.ts` or similar): per-player
   `Uint8Array` visibility (0 unexplored / 1 explored / 2 visible) with
   incremental sight-circle updates on unit spawn/move/death (no full-map
   recompute); a sparse **remembered-tile** record per player (what terrain
   looked like when last seen). `PlayerView`: a read-only, fog-filtered
   query surface (doc 04 §3.2's sketch — `Game.view(playerId)`) that is the
   ONLY way to read tiles/units for a given player; must never leak data for
   visibility-0 tiles beyond remembered terrain.
6. **Rendering** (apps/game): unit sprites (simple geometric placeholder —
   colored circle/marker is fine, this isn't the art milestone) on the
   terrain layer, driven by `UnitMoved`/spawn events; a fog overlay layer
   (per-chunk alpha mesh per doc 04 §6, dark for unexplored, dimmed for
   explored-not-visible, clear for visible); click-to-select a unit, then
   right-click/click a reachable tile to move it, with the reachable-tiles
   set highlighted on selection.
7. **Playwright coverage**: select the scout, see its highlighted move
   range, move it across 5 turns, assert the revealed-tile count strictly
   grows each move (query `window.__civ8` test hooks — extend them as M2's
   pattern did).
8. **Pathfinding bench**: add to `apps/cli/src/bench.ts` — median/p99 A*
   path time on a huge map; must be under doc 04 §7's budget (median <1ms,
   p99 <5ms per that doc; if unmet, report honestly rather than silently
   loosening the assertion).

## Out (explicit)

Combat/attack (M5), cities/settlers (M4), production, naval units beyond
the type tag, richer terrain cost tables beyond a first pass, embark/
disembark transitions (note the seam, don't build it).

## Acceptance criteria

1. In the browser: select the scout, see its reachable-tile highlight, move
   it over 5 turns, watch fog roll back — screenshot evidence.
2. Playwright asserts revealed-tile count strictly increases turn over turn
   (report the actual counts).
3. ZOC unit-test table passes (all four cases above, at minimum).
4. Pathfinding bench numbers reported against the doc 04 §7 budget.
5. `pnpm run ci` fully green including new property/unit tests; determinism
   double-run byte-identical; report new seed-1 sim final hash (state shape
   changed — expected).
6. New SAVE_VERSION migration + golden-save fixture for the previous version
   loads and replays (same pattern M2 established for v0→v1).
7. `PlayerView` integrity: a test proving it never returns unit/tile data
   for a tile at visibility 0 beyond the remembered snapshot.

Constraints: engine stays zero-runtime-deps (content's Zod dependency must
never leak in); integer math only in engine; all existing M0-M2 gates
(lint, depcruise, determinism) stay green throughout.
