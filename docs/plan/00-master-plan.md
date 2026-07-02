# 00 — Master Plan: Civilization VIII

**Status: plan complete. Implementation is gated on the project owner's
green light. On approval, work begins at Milestone M0 (doc 05).**

## Executive summary

Civilization VIII is a ground-up, browser-first, turn-based 4X built to be
the best civilization game ever made — a claim we operationalize as five
measurable commitments (doc 01): games that get finished, an AI that plays
the real game without cheats, flat time-to-decision across all 330 turns,
total system legibility, and determinism as a player-facing feature.

The design keeps the genre's sacred core (hexes, techs, wonders, leaders,
"one more turn") and commits specific answers to its five chronic failures:
**Governance** budgets interventions and makes automation first-class (kills
the late-game slog); **Turning Points** are era-scale world events that hit
leaders hardest (kills the snowball); **commanders & formations** replace the
unit carpet (restores tactics, enables real AI wars); a **utility AI with a
headless AI-vs-AI tournament harness** makes opponent quality a measured,
regression-tested number; and **living victory tracks with a designed Final
Act** make the endgame the best part instead of the abandoned part.

Technically (doc 04): a pure, dependency-free, deterministic TypeScript
simulation engine — every game a function of `(content, seed, commandLog)` —
under a PixiJS map renderer and React HUD, in a pnpm monorepo whose package
boundaries are CI-enforced. All content is schema-validated JSON, moddable
from day one. Fourteen milestones (doc 05) go from empty repo to 1.0, with a
complete playable game existing from M5 onward and every milestone gated on
concrete acceptance criteria.

## How the documents fit together

| Doc | Question it answers | Depends on |
| --- | --- | --- |
| [01 — Vision & Pillars](01-vision-and-pillars.md) | Why will this be the best ever? What do we never compromise? | — |
| [02 — Game Design](02-game-design.md) | What exactly is the game? | 01 (pillars test every feature) |
| [03 — AI Design](03-ai-design.md) | How is the opponent a headline feature? | 02 (systems designed for AI playability) |
| [04 — Technical Architecture](04-technical-architecture.md) | How is it built? | 02, 03 (the sim serves the design) |
| [05 — Roadmap](05-roadmap.md) | In what order, and how do we know each step worked? | all |
| [06 — Quality, Balance & UX](06-quality.md) | What are the bars, and how are they measured? | all |

## Decisions locked by this plan

| Decision | Choice | Doc |
| --- | --- | --- |
| Platform / language | Browser-first, TypeScript, no proprietary engine | 04 §1 |
| Rendering | PixiJS 8 map + React 19 HUD | 04 §1, §6 |
| Sim architecture | Pure deterministic engine; commands in, events out; **no ECS** | 04 §3 |
| Turn structure | Sequential turns; lockstep-multiplayer-ready scheduler | 04 §3.2 |
| Cities | Quarters built by growth; three-tier adjacency | 02 §3.2 |
| Anti-slog | Governance intervention budget + first-class automation | 02 §3.4 |
| Anti-snowball | Turning Points at era transitions; no era resets, no civ-switching | 02 §4, 01 |
| Combat | Commanders & formations on a deployment ribbon; no unit carpet | 02 §6 |
| AI | Three-layer utility AI, data-tuned, zero cheats at default; tournament harness in CI | 03 |
| Victory | Five living tracks + the Final Act endgame | 02 §11 |
| Content | 12 civs / 14 leaders at 1.0; everything data-driven and moddable | 02 §12, 04 §2 |
| Scope out for 1.0 | Networked MP (hot-seat ships; spike proves lockstep), 7th era, dynasty layer | 02 §14, 05 |

## What the green light triggers

1. **M0 — Scaffold & CI**: monorepo, lint/boundary enforcement, deterministic
   engine skeleton, Pixi hello-hexagon, headless sim runner, full CI — all
   acceptance-tested (doc 05).
2. From there, the milestone ladder in order, each gated on its acceptance
   criteria and doc 06 §5's Definition of Done.
3. Standing cadence: every PR runs the determinism double-run (from M0) and
   the 5-seed AI gate (from M5); nightly tournaments track balance bands from
   M7 and block merges on them from M12.

## Open items for the owner (none blocking)

- **Title**: "Civilization VIII" is a working title (trademark note, doc 01);
  a real name is only needed if the game is ever distributed.
- **Roster preferences**: the 12-civ launch roster (doc 02 §12) is proposed;
  owner picks are welcome before M12 authoring begins.
- **Art direction**: doc 06 §6 commits to a readable, consistent style via a
  placeholder→final pipeline; a style-reference decision is due around M8.
