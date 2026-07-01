# 06 — Quality, Balance & UX

Being "the best ever" is mostly won here: in pacing, polish, information
design, and relentless measurement. This doc defines how quality is produced
and verified. Testing infrastructure specifics live in doc 04; this doc owns
the standards.

## 1. UX principles

1. **Tooltips all the way down.** Every displayed number expands to its full
   derivation; every derivation's terms are themselves inspectable. This is
   implemented as a core UI capability (yield breakdowns are structured data
   in the sim, not display-side arithmetic — doc 04).
2. **Preview before commit.** Combat odds, quarter adjacency tiers, policy
   effects, deal valuations, and Turning Point choices all show resolved
   consequences before the player commits. The deterministic core makes
   previews exact, not estimates.
3. **Undo is a right.** Start-of-turn undo in single-player (below top
   difficulty), disabled only by information reveals the player has seen.
4. **No modal nagging.** Alerts collect in a turn ribbon; nothing steals the
   cursor. "End turn" is always one click plus explicit blockers.
5. **The map is the primary UI.** Lenses (yields, stability, religion,
   danger, victory) over the real map beat separate screens; full-screen
   menus are for setup, not play.
6. **Performance is UX.** Budgets in doc 04 (turn time, frame rate) are
   release criteria, not aspirations.

## 2. Accessibility (launch requirements, not patches)

Colorblind-safe palettes with pattern redundancy on all map lenses; full
keyboard navigation and remapping; UI scaling 100–200%; reduced-motion mode;
captions/visual cues for all audio signals; dyslexia-friendly font option.
Accessibility checks are part of each UI milestone's acceptance criteria.

## 3. Balance methodology

- **The harness is the referee** (doc 03 §6): balance claims must come with
  AI-vs-AI distribution data. Target bands at 1.0, standard settings:
  - each victory type: 10–35% share of decided games;
  - each civ: 45–55% normalized win rate band;
  - median decided-game length: turns 240–300 of 330;
  - early elimination (before turn 120) under 10% of civs per game.
- **Pacing telemetry from human play**: instrumented builds record
  time-per-turn and interventions-per-turn distributions; the doc-01
  "time-to-decision stays flat" commitment is verified against real sessions
  every milestone from the vertical slice on.
- **All numbers in data files** (doc 04): a balance pass is a data PR with a
  harness report, reviewable and revertible like any code.

## 4. Playtesting cadence

- Every milestone from M4 (vertical slice) ends with a **full-game playthrough
  gate**: a complete game on the milestone's content must be played to an
  ending, and its friction log triaged, before the milestone closes.
- Self-play review: watch harness replays of AI-vs-AI games at milestone
  ends — replay files are cheap (command logs), and watching the AI play
  reveals both AI stupidity and rules degeneracy fast.
- A standing **fun ledger** per milestone: the three best and three worst
  moments from playtests, tracked so polish effort targets real lows.

## 5. Definition of Done (applies to every milestone in doc 05)

A milestone is done only when: all acceptance criteria demonstrably pass;
unit + determinism + golden-master suites green in CI; harness sweep shows no
band regressions (from M5 on); performance budgets met on the reference map;
no known crash or save-corruption bugs; new systems have in-game tooltips and
Civilopedia entries (docs are content, shipped with the feature); playthrough
gate passed (from M4 on).

## 6. Content quality bars

- **Writing:** every civ, leader, tech, civic, wonder, and Turning Point has
  flavor text meeting a house style guide (concise, historical, warm, no
  lorem-ipsum placeholders past the milestone that introduces the entity).
- **Art:** placeholder-tiered pipeline — geometric placeholder → styled
  final — tracked per asset class; no milestone after M8 ships new systems
  on placeholder-tier art. Consistent readable style over fidelity.
- **Audio:** UI feedback sounds from M8; era-layered music and ambient beds
  by M11; all audio events data-driven.

## 7. Top design risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Governance feels like a leash, not a liberation | Tune free-policy competence first (automation must be *good*); Governance costs only on interventions that were chores; vertical-slice playtest gate specifically probes this |
| Turning Points feel like scripted punishment | Always choice-driven responses; hit-the-leader logic transparent; can be disabled per-game-setup for purists |
| Formations flatten tactical variety | Deployment ribbon depth budget reviewed at M6 with dedicated combat playtests; solo-unit skirmish layer preserved |
| Living victory tracks make the leader a permanent pile-on target | Final Act counterplay is bounded and priced; leader gets defensive tools; harness watches comeback and hold rates |
| Scope: this GDD is enormous | Doc 05's strict milestone gating; every system has a minimum-lovable version defined at its milestone; content roster scales down before systems get cut |
| Solo-developed balance blind spots | The harness substitutes volume for staff; seeds shared for reproducible bug reports; mod-friendly data invites external iteration |
