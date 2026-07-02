# Civ-8 — Progress Report & Session Handoff

**Written:** 2026-07-02, end of build session 1. **Next session:** auto-resumes
in ~4 hours via scheduled wake-up. Owner instruction on record: keep building
the milestone ladder without further prompting.

## Where the project stands

| Area | Status |
| --- | --- |
| Project plan (docs/plan 00–06) | ✅ Complete, adversarially reviewed (36 findings fixed), pushed |
| M0 — Scaffold & CI | ✅ **Complete.** All 5 acceptance criteria verified; CI run #1 green on GitHub Actions (54s) |
| M1 — Deterministic engine core | 🔄 **In flight.** Implementation agent was running when the session paused |
| M2 → M13 | ⏳ Queued per docs/plan/05-roadmap.md |

**Branch:** `claude/civ8-game-plan-uma0ww` (default branch of the repo; no PR
possible until a separate base branch exists — noted, owner-aware).
**Commits so far:** plan (b61df8c) → plan hardening (efe1d1d) → M0 (b3fa545).

## What M0 delivered (commit b3fa545)

- pnpm monorepo: `packages/{engine,content,ai,ui-components}`,
  `apps/{game,cli}`, boundaries CI-enforced by dependency-cruiser
  (engine purity proven red-then-green).
- `packages/engine`: zero-dependency deterministic core — PCG32
  (reference-vector verified) with named substreams, allocation-free 64-bit
  FNV-1a canonical state hash, `Game` facade (create/execute/hash/snapshot),
  EndTurn only.
- `apps/cli` sim runner (per-turn hash chains, bounded args); `apps/game`
  Vite 7 + Pixi 8 hexagon; Playwright smoke vs pre-installed Chromium.
- ESLint determinism bans (Math.random, Date.now, for...in, raw Object.keys)
  across engine+ai for all TS extensions.
- CI: typecheck → lint → depcruise → 21 unit tests → determinism double-run
  diff → Playwright smoke, with browser caching and artifacts.
- Sim reference: `pnpm sim -- --seed 1 --max-turns 10` → final hash
  `6d68dacad3967e6e` (byte-identical across runs).
- Process followed: verify skill (drove CLI + browser surfaces, probes) and
  code-review skill (5 finder agents + fixes) ran pre-commit; 8 findings
  fixed, incl. lint-glob bypass (.mts/.tsx), missing Object.keys ban,
  depcruise type-only content edge, sim arg validation, hot-path hash
  allocations.

## In flight: M1 (deterministic engine core)

A background agent is implementing M1 per docs/plan/05: GameState skeleton
(SortedMap, branded IDs), command registry (replacing the EndTurn if-chain),
SaveGame format + load/replay, migration framework v0, fast-check property
tests (replay identity ×500, save/load transparency, round-trip), golden-log
fixtures + `replay` CLI, shared turn-runner helper, `docs/determinism.md`.

**Its work is uncommitted working-tree changes when it finishes.** Safety
plan if the agent completes before the container idles: run `pnpm run ci`;
if green, commit+push as a clearly-labeled M1 WIP (pending review) so no
work can be lost to container reclamation. Full acceptance verification +
code-review still gate the real M1 close.

## On resume — do this in order

1. Collect the M1 agent's final report (or inspect the working tree /
   `git log` if a WIP commit was already pushed). Verify M1 ACs from
   docs/plan/05: property tests at stated run counts; save→reload→replay
   hash-chain match demonstrated; `pnpm run ci` green; sim double-run
   identical (final hash will have changed from 6d68… — expected, turn
   advancement now walks players); tampered golden fixture makes `replay`
   CLI fail; `docs/determinism.md` exists.
2. Run the code-review skill on the M1 diff (finder agents), fix, then
   commit M1 with the milestone-summary format used for M0, push, confirm
   the Actions run is green.
3. Mark task #2 completed, #3 in_progress; launch the M2 agent (mapgen &
   rendering) per docs/plan/05 M2. Carry these review notes into the M2
   brief: no per-frame allocations in the render loop; precompute unit-hex
   corner offsets once; chunked RenderTexture baking per doc 04 §6; add the
   `bench` script (doc 04 lists it; deferred from M0); consider a sim.ts
   unit test for arg parsing (vitest glob for apps/cli/test currently
   matches nothing).
4. Continue the ladder (M3 → …) with the same per-milestone loop:
   agent-implement → verify ACs at the real surfaces → code-review →
   commit → push → CI green → next.

## Standing context

- **Process contract (CLAUDE.md + plan):** skills (verify, code-review) and
  agent delegation are mandatory; ACs come from docs/plan/05; deviations
  from the plan must edit the plan docs in the same change.
- **Claude_all repo:** CLAUDE.md updated with project pointer + green-light
  record; draft PR #1 open (base `claude/access-skills-md-file-iv9090`),
  session subscribed to its activity; no CI configured there; nothing
  pending.
- **Useful commands:** `pnpm run ci` (full local gate incl. determinism),
  `pnpm sim -- --seed N --max-turns N`, `pnpm e2e` (Playwright),
  `pnpm mapgen` (arrives with M2).
- **Environment notes:** Playwright browsers pre-installed at
  `/opt/pw-browsers` (never `playwright install` locally); `pnpm run ci`,
  not `pnpm ci` (pnpm 10 reserves the name).
