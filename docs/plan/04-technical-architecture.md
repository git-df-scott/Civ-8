# 04 — Technical Architecture

The single most important architectural commitment, from which everything else
follows: **the simulation engine is a pure, deterministic, dependency-free
TypeScript library that never imports the DOM, PixiJS, or React.** Everything
observable about a game is a function of `(contentPack, seed, commandLog)`.
The renderer, the AI, the test harness, and (later) hot-seat and networked
multiplayer are all just different producers/consumers of commands and events
against that engine.

## 1. Stack

| Concern | Choice | Justification |
| --- | --- | --- |
| Runtime / PM | Node 22 LTS + pnpm 10 workspaces | Monorepo with strict dependency boundaries; matches the container toolchain |
| Language | TypeScript ~5.8, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | Max strictness is the cheapest bug prevention; branded ID types (`UnitId`, `TileIndex`) kill cross-wiring bugs |
| Build/dev | Vite 7 (app); plain `tsc` for library packages | Instant HMR for the app; libraries need no bundler |
| Rendering | **PixiJS 8** (WebGL2, WebGPU when available) | See below |
| HUD/UI | React 19 + Zustand 5 | React for menus/panels/tech-tree; Zustand works outside components, so the engine event bus can push into it |
| Unit/property tests | Vitest 3 + fast-check 4 | Headless engine tests at speed; property-based determinism tests |
| Browser tests | Playwright (pre-installed Chromium) | Smoke tests, screenshot assertions, frame-time tracing |
| Schema validation | Zod 4 (+ JSON Schema export) | One schema = runtime validation + inferred types + editor autocomplete for modders |
| Lint/format | ESLint 9 + typescript-eslint + Prettier + **dependency-cruiser** | depcruise CI-enforces "engine imports nothing from pixi/react/dom" and "no cycles"; custom lint bans `Math.random`/`Date.now` in engine & AI |
| CI | GitHub Actions | `ci.yml`: typecheck → lint → depcruise → unit → determinism double-run → headless AI matches → Playwright smoke. Nightly `balance.yml`: 100-seed tournaments |

**Why PixiJS over raw Canvas2D:** a huge map is ~10k hex tiles with terrain,
features, improvements, fog, borders, plus hundreds of sprites, and the core
interaction is smooth pan/zoom. Canvas2D at 60fps means hand-rolling
dirty-rect chunking — rebuilding a worse Pixi. Pixi 8 gives batched WebGL
sprites, culling, render-texture baking of static terrain chunks, first-class
TS types, and stays a *library* (no engine lock-in; runs under headless
Chromium). Canvas2D survives only in the CLI's debug map-preview renderer.

## 2. Repository layout

pnpm monorepo. The dependency graph *is* the architecture, enforced by
dependency-cruiser:

```
engine  ← content-schemas          (engine depends on nothing else; zero DOM)
ai      ← engine
app     ← engine, ai, content, ui-components
cli     ← engine, ai, content      (headless; no DOM)
```

```
/
├── package.json                  # workspace root; scripts: ci, sim, bench
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── .dependency-cruiser.cjs       # boundary rules (engine purity, no cycles)
├── .github/workflows/
│   ├── ci.yml                    # every push/PR
│   └── balance-nightly.yml       # 100-seed AI tournament + stats report
├── packages/
│   ├── engine/                   # THE deterministic sim core (pure TS)
│   │   ├── src/
│   │   │   ├── state/            # GameState, entity stores, branded ids
│   │   │   ├── commands/         # Command types, validate.ts, apply.ts
│   │   │   ├── events/           # events emitted by apply()
│   │   │   ├── rules/            # combat, yields, growth, movement, research,
│   │   │   │                     # civics, governance, diplomacy, religion,
│   │   │   │                     # turningPoints, victory
│   │   │   ├── map/              # hex math, typed-array grid, pathfind,
│   │   │   │                     # visibility, mapgen/ (staged pipeline)
│   │   │   ├── rng/              # pcg32.ts, named substreams
│   │   │   ├── serialize/        # canonical.ts, save.ts, migrations/, hash.ts
│   │   │   ├── view/             # PlayerView: fog-filtered read API (AI & UI)
│   │   │   └── index.ts          # Game facade: create/load/execute/view/hash
│   │   └── test/
│   ├── content/
│   │   ├── schemas/              # zod: unit, building, quarter, tech, civic,
│   │   │                         # civ, leader, terrain, resource, belief,
│   │   │                         # turningPoint, aiWeights
│   │   ├── base/                 # the base-game content pack (JSON)
│   │   ├── src/loader.ts         # load + validate + freeze + contentHash
│   │   └── test/                 # schema + referential-integrity tests
│   ├── ai/
│   │   ├── src/
│   │   │   ├── strategic/        # posture selection (utility scored)
│   │   │   ├── operational/      # missions: settle, war plans, diplomacy
│   │   │   ├── tactical/         # army orders, deployment-ribbon assignment
│   │   │   ├── economy/          # the city-policy planner (shared w/ player
│   │   │   │                     # automation — see doc 03 §2)
│   │   │   └── index.ts          # AiPlayer: (PlayerView) => Command[]
│   │   └── test/
│   └── ui-components/            # shared React components
├── apps/
│   ├── game/                     # the playable browser app (Vite)
│   │   ├── src/
│   │   │   ├── render/           # Pixi: layers, camera, chunks, sprites
│   │   │   ├── input/            # pointer/keyboard → Intents → Commands
│   │   │   ├── store/            # Zustand slices fed by engine events
│   │   │   ├── screens/          # React: menus, HUD, city, tech, diplomacy
│   │   │   ├── bridge/           # GameSession: engine instance, event bus,
│   │   │   │                     # IndexedDB autosave, replay recorder
│   │   │   └── assets/
│   │   └── e2e/                  # Playwright specs + screenshot baselines
│   └── cli/src/
│       ├── sim.ts                # AI-vs-AI runner → JSON telemetry
│       ├── replay.ts             # replay command log, verify hash chain
│       ├── mapgen-preview.ts     # seed → PNG for eyeballing maps in CI
│       └── bench.ts              # turn-time & pathfinding benchmarks
├── docs/                         # plan/ (these docs) + architecture notes
└── test-fixtures/
    ├── golden-saves/             # one real save per historical saveVersion
    └── golden-logs/              # seed + command log + expected hashes
```

Monorepo over single package purely for *enforceable boundaries*: the
compiler and depcruise make it physically hard to sneak a `pixi.js` import
into combat rules.

## 3. Simulation core

### 3.1 State model: plain typed relational state — **not** ECS

ECS earns its complexity iterating homogeneous components 60×/second. A
turn-based 4X is the opposite workload: heterogeneous, relational, rule-dense
logic run once per turn ("sum yields of tiles worked by cities of players at
war with X" is a relational query, not a cache-locality problem). ECS would
hurt the two things we care most about: serialization simplicity and
legibility of rules code. Instead: normalized, database-shaped state with
branded IDs; collections behind a `SortedMap` wrapper guaranteeing
ascending-ID iteration (killing the #1 nondeterminism source).

All game quantities are **scaled integers** (movement in sixtieths, yields
×100). No floats in rules code — lint-enforced. Floats are allowed only in AI
*scoring*, which never feeds state (only command selection, itself
deterministic: deterministic inputs, ties broken by lowest ID).

Derived caches (visibility counts, yield caches) are rebuildable, never
serialized, recomputed on load — never sources of truth.

### 3.2 Command/event pattern

One write entry point:

```ts
class Game {
  execute(cmd: Command): Result<GameEvent[], RuleViolation>;
  view(p: PlayerId): PlayerView;   // fog-filtered, read-only
  hash(): string;                  // canonical 64-bit state hash
  snapshot(): SaveGame;
}
```

- **Commands** are small serializable player intents (`MoveArmy`, `Attack`,
  `FoundCity`, `SetPolicy`, `SpendGovernance`, `ProposeDeal`, `EndTurn`…),
  validated against legality *and the issuer's fog* — you cannot target what
  you cannot see, and neither can the AI.
- `apply()` mutates state (plain mutation; determinism comes from the command
  log, not structural sharing) and returns **events** (`UnitMoved`,
  `CombatResolved{log}`, `CityGrew`…) — the renderer's animation feed and the
  UI store's trigger; derivable, never authoritative.
- **Sequential turns** (Civ-classic): commands execute immediately;
  `EndTurn` runs the turn-end pipeline (heal → yields → production → growth →
  research → borders → stability → victory checks) and advances the active
  player. Networked lockstep later is a different EndTurn scheduler over the
  same commands — not foreclosed.

### 3.3 Deterministic RNG

- **PCG32** (~40 lines, `Math.imul`/`>>>` integer ops; no BigInt in hot
  paths). State serialized in saves.
- **Named substreams** — `rng.stream('mapgen')`, `('combat')`,
  `('ai:<player>')` — seeded via `splitmix32(masterSeed ⊕ fnv1a(name))`, so
  adding a combat roll never shifts mapgen or another player's AI; golden
  masters stay stable across unrelated changes.
- Lint-banned inside engine & ai packages: `Math.random`, `Date.now`,
  `performance.now`, `crypto.getRandomValues`, `for...in`, raw
  `Object.keys()` ordering (a `sortedKeys()` helper is the only door).

### 3.4 Saves & migration

```ts
interface SaveGame {
  saveVersion: number;        // bumped on any state-shape change
  engineVersion: string;
  contentHash: string;        // content pack the game was created with
  seed: number;
  snapshot: SerializedState;  // canonical: sorted keys, typed arrays → base64
  commandLog: Command[];      // full log — replay, spectate, bug repro
  turnHashes: string[];       // per-turn hash chain — desync forensics
}
```

- **Canonical serialization**: same state ⇒ byte-identical output; its FNV-1a
  hash is the determinism checksum used by replay tests, the harness, and
  future multiplayer desync detection.
- Load fast path restores the snapshot; a verification path replays the
  command log from seed and asserts the hash chain (CI on golden logs; debug
  flag in-app).
- **Migrations**: an ordered chain `(raw v N) => v N+1`, then Zod-validate
  against the current schema. `golden-saves/` keeps one real save per
  historical version; CI asserts each still loads and replays. Command logs
  are guaranteed replayable only within a saveVersion; cross-version loads
  rely on the snapshot.

## 4. Map & hex engineering

- **Axial coordinates** (Red Blob conventions, pointy-top), cube conversion
  on demand for distance/lines; cylindrical wrap via one `wrapQ()` helper
  used by all neighbor math.
- **Struct-of-typed-arrays** storage indexed by `tileIndex = r*width + q`:
  `terrain/feature/elevation/resource/improvement: Uint8Array`,
  `ownerCity: Int16Array`, `riverEdges: Uint8Array` (6-edge bitmask — rivers,
  including navigable ones, live on edges). ~10 bytes/tile ⇒ a huge map is
  ~100KB and serializes to base64 trivially.
- **Mapgen pipeline**: pure, individually snapshot-testable stages, each
  under its own RNG substream: landmass (integer-seeded noise, own ~80-line
  implementation — no float-seeded npm libs) → elevation/ridges → climate
  bands → biome lookup → downhill river tracing with lakes → features →
  quota-based resources → start-position scoring with a fairness repair pass
  (doc 02 §2.2) → validation asserts with stage diagnostics.
- **Pathfinding**: A* with a binary heap; data-driven per-movement-class
  costs (terrain, river-edge crossings, roads, embark transitions). **ZOC**
  as a per-player incrementally-maintained bitmask read during neighbor
  expansion (Civ V semantics). Reachable-tiles = budgeted Dijkstra, shared
  cost code. Paths compute against the requester's *fog view* (unexplored ⇒
  assumed passable) so human and AI plan under identical information.
  Hierarchical pathfinding only if `bench.ts` shows >2ms median on huge maps.
- **Fog of war**: per player `visibility: Uint8Array` (unexplored / explored
  / visible) + sight-source reference counts, updated incrementally on
  move/spawn/death with elevation line checks. **Remembered state** — a
  sparse per-player record of what each tile looked like when last seen — is
  what the renderer draws under grey fog *and what `PlayerView` serves to the
  AI*: nobody reads truth through fog.

## 5. AI implementation notes

Doc 03 owns the design (three utility-scored layers, weights in
`ai-weights.json`, personalities as data). Implementation constraints:

- The AI consumes **only `PlayerView`** and emits **only `Command`s** — it
  cannot cheat and exercises exactly the human command surface (free
  integration testing of the rules API).
- Tactical scoring uses engine-exposed previews (`previewCombat()`), the same
  functions that power the player's pre-commit UI (Pillar 4 for free).
- Economy sub-brains are ranking functions over *content data* + priority
  tags, so new content is automatically playable by the AI with zero AI code.
- The harness (`cli sim`) runs seeds → JSON telemetry (winner, victory type,
  yield curves, decision logs with top-3 scored options); CI runs a 5-seed
  crash/decisiveness/determinism gate per PR, nightly runs 100-seed
  tournaments diffed against committed baseline bands (doc 06 §3).

## 6. UI architecture

Two render domains, one data flow:

- **Map = Pixi canvas**, layered: terrain chunks (16×16-hex groups baked to
  `RenderTexture`s, re-baked only on tile-change events, camera-culled) →
  borders/grid → improvements/resources → units & armies (animated, driven by
  events) → fog overlay (per-chunk alpha mesh) → selection/path/combat
  previews. One `camera.ts` owns all pointer math; inertial pan/zoom.
- **HUD/menus = React DOM over the canvas.** React never draws into the
  canvas; Pixi never lays out text-heavy UI. The seam: hit-tests resolve in
  the render layer and publish to the Zustand store.
- **Data flow**: `bridge/GameSession` owns the engine. After each
  `execute()`, it forwards events to the Pixi animation queue and updates
  Zustand slices via selectors over `game.view(human)`. React never touches
  engine state directly (no mutation, no tearing).
- **Input → command**: pointer/keyboard → `Intent` → resolver queries engine
  for legality + previews → `Command` → `session.execute()` → events animate.
  Illegal intents die at the resolver with feedback; the engine validator
  stays the final authority for all issuers.
- AI turns run through the identical `execute()` path, chunked so visible
  enemy moves animate for the human (events carry visibility filtering).

## 7. Performance budgets (release criteria, tracked from M2)

| Budget | Target | Enforcement |
| --- | --- | --- |
| Full turn rotation, 8 players, huge map, mid-game | < 2.0s total; < 300ms per AI | `bench.ts` scenario fixtures; CI asserts < 2× budget, trends tracked |
| Single A* path, huge map | median < 1ms, p99 < 5ms | micro-bench |
| Map pan/zoom, huge map revealed | 60fps; < 5% dropped frames | Playwright + Chrome tracing |
| Mapgen, huge map | < 3s | bench fixture |
| Save serialize / load+validate | < 500ms / < 2s | bench fixture |
| Heap, mid-game | < 400MB | Playwright `page.metrics()` |

Kept structurally: typed-array map state (no per-tile objects), chunk-baked
terrain (pan cost ∝ visible chunks), zero per-frame allocation in the render
loop, incremental visibility/ZOC (never full-map recompute), capped+pruned AI
action enumeration — and benches exist from M2 so regressions die young.

## 8. Testing strategy

1. **Rule unit tests** (Vitest): table-driven specs per rules file; ≥90% line
   coverage gate on `engine/src/rules/` only (coverage gates on UI are
   theater).
2. **Determinism property tests** (fast-check) — the crown jewels:
   replay-identity (random legal command sequences run twice ⇒ identical hash
   chains), save/load transparency (snapshot mid-game, continue both ⇒
   identical), serialization round-trip, and view integrity (`PlayerView`
   never leaks fogged data).
3. **Golden masters**: committed `(seed, commandLog, expectedTurnHashes)` for
   ~10 curated games + per-stage mapgen snapshots. Intentional rules changes
   regenerate via `pnpm goldens:update` — the reviewed diff *is* the
   behavioral changelog.
4. **Save-migration tests**: every historical golden save loads, validates,
   replays.
5. **Content tests**: every JSON file passes schema; referential integrity
   (tech tree is a DAG, every civ's uniques exist); "AI can build
   everything" (nothing unreachable by the production chooser).
6. **Harness gates** per §5, plus the determinism double-run of every sim job
   from M0.
7. **Playwright smoke**: ~10 fat scenarios (boot → new game on fixed seed →
   screenshot map → move unit → found city → end turns → save → reload →
   assert), screenshots as CI artifacts; axe-core accessibility scan from the
   polish milestone.

## 9. Top technical risks & mitigations

1. **Determinism leaks** (floats, iteration order, hidden randomness).
   → Integer-only rules, `SortedMap`, lint bans, per-turn hash chain, CI
   double-runs from M0: leaks are caught the commit they land, with the turn
   number.
2. **Sim/render coupling drift.** → Package boundaries + depcruise gate +
   `PlayerView` as the only read surface for UI and AI alike.
3. **AI quality treadmill.** → Utility architecture improves by adding scored
   terms and tuning data weights; the tournament harness turns "is the AI
   better?" into a nightly number; content-driven AI means new content needs
   no new AI code.
4. **Late-game performance collapse.** → Budgets and bench fixtures gate
   every milestone from M2; typed arrays; incremental-recompute patterns
   established early.
5. **Save-format breakage across a long build.** → Versioned migration chain
   + golden saves per version in CI from M1.
6. **Scope creep in content-heavy milestones.** → Data-driven content makes
   scope cuts JSON deletions, not code surgery; every milestone has an
   explicit "out" list; the M5 vertical slice guarantees a shippable game
   exists at all times.
7. **PixiJS major-version churn.** → All Pixi usage confined to
   `apps/game/src/render/`; engine and AI renderer-agnostic; pin `^8`.
8. **Agent-driven development's failure mode: unverifiable changes.** → The
   whole plan is shaped around headless verifiability; nothing merges on
   "looks right" — every feature lands with a test, a sim-observable effect,
   or a Playwright assertion.
9. **Multiplayer foreclosure.** → Command log + lockstep-ready turn scheduler
   + per-turn hashes + fog-enforcing `PlayerView` are all built for
   single-player reasons and are exactly the networked-lockstep requirements;
   a two-tab BroadcastChannel spike proves it before 1.0 (doc 05, M13).

## 10. First files (in dependency order, on green light)

1. `packages/engine/src/index.ts` — the `Game` facade; the single write entry
   point everything depends on.
2. `packages/engine/src/rng/pcg32.ts` — RNG + substreams; correctness here
   underpins every test in the repo.
3. `packages/engine/src/serialize/canonical.ts` — canonical serialization +
   hashing; enables replay tests, goldens, saves, desync detection.
4. `packages/content/schemas/index.ts` — the Zod content contract.
5. `apps/cli/src/sim.ts` — the headless runner; the verification backbone
   from M0 onward.
