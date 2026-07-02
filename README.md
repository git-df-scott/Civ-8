# Civilization VIII

A ground-up, browser-first 4X strategy game with one goal: **be the best
civilization game ever made.** Turn-based empire building from the first
campfire to the stars — with the deepest simulation, the smartest AI, and the
least busywork the genre has ever shipped.

> **Status: Planning complete — awaiting green light to begin building.**
> No implementation work starts until the project owner approves the plan.

## The plan

The full project plan lives in [`docs/plan/`](docs/plan/):

| Doc | Contents |
| --- | --- |
| [00 — Master Plan](docs/plan/00-master-plan.md) | Executive summary, definition of success, how the docs fit together |
| [01 — Vision & Pillars](docs/plan/01-vision-and-pillars.md) | Why this will be the best civ game ever, competitive analysis, design pillars |
| [02 — Game Design](docs/plan/02-game-design.md) | The full game design document: map, cities, combat, diplomacy, victory, everything |
| [03 — AI Design](docs/plan/03-ai-design.md) | The AI as a headline feature: architecture, personalities, legibility |
| [04 — Technical Architecture](docs/plan/04-technical-architecture.md) | Stack, deterministic sim core, rendering, save format, modding |
| [05 — Roadmap](docs/plan/05-roadmap.md) | Milestones M0 → M13 with concrete acceptance criteria |
| [06 — Quality, Balance & UX](docs/plan/06-quality.md) | Testing strategy, balance methodology, UX principles, risks |

## The one-paragraph pitch

Civilization VIII keeps everything the genre does best — the "one more turn"
pull, the sweep of history, the joy of a map slowly becoming *yours* — and
attacks the five problems every predecessor shipped with: the late-game slog,
the brain-dead AI, the unit-carpet micromanagement, the snowball that decides
the game at the halfway mark, and victory conditions nobody thinks about until
turn 250. A deterministic simulation core makes the AI testable at scale,
makes replays and undo free, and makes multiplayer honest. Everything is
data-driven and moddable from day one.
