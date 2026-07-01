# 01 — Vision & Pillars

## Vision statement

**Civilization VIII is the strategy game you finish.** Every civ game ever
made is beloved for its first 100 turns and abandoned in its last 100. Our
vision is a 4X where turn 280 is as tense as turn 30, where the AI opponent
across the map is a genuine rival rather than a scripted speed bump, and where
the player spends their time making *decisions* instead of performing *chores*.

We will keep the sacred material: hexes, the fog rolling back, settlers and
wonders, the tech tree as a ladder through real history, leaders with faces
and grudges. We are not reinventing the genre. We are finishing it.

## What "best ever" means — concretely

"Best civilization game ever made" is a design requirement, not a slogan. It
decomposes into measurable commitments the roadmap is built around:

1. **Completion rate.** In genre telemetry, most 4X games are quit before any
   victory screen. Target: a majority of started standard-length games reach
   an ending. Everything in the design that fights the late-game slog serves
   this number.
2. **AI that plays the real game.** On the default difficulty the AI receives
   *zero* yield cheats — it wins or loses with the same rules, information
   asymmetries excepted, as the player. Measured continuously by the headless
   AI-vs-AI harness (see doc 03).
3. **Time-to-decision.** Median real time between meaningful decisions stays
   flat across the whole game. If late-game turns are 4× longer than
   early-game turns but contain the same number of real choices, we have
   failed and the governance/automation systems get tuned until we haven't.
4. **Every system explains itself.** Any number on screen can be expanded to
   its full derivation. Any AI diplomatic reaction can be inspected. No
   wiki-required mechanics.
5. **Determinism as a feature.** Same seed + same inputs = same game, always.
   This buys shareable seeds, full-game replays, pre-information undo, honest
   multiplayer, and a testable AI. It is non-negotiable in the architecture.

## Competitive analysis — what we take, what we fix

| Game | Take | Fix / avoid |
| --- | --- | --- |
| Civilization IV | Depth, moddability, civics flexibility | Stacks of doom; opaque mechanics |
| Civilization V | Hex map, elegant readability, city-states | 1UPT unit carpets that broke the AI; global happiness whack-a-mole |
| Civilization VI | Unstacked cities, district adjacency puzzle, Gathering Storm's living world | Snowballing; weak AI; eureka checklist-gaming; late-game slog |
| Civilization VII | Era crises as pacing device, commander-based armies, navigable rivers | Forced civ-switching (breaks the fantasy); era hard-resets that discard player investment |
| Humankind | Ambition of era transitions, terrain-integrated districts | Culture-switching identity mush; poor system legibility |
| Old World | The orders economy (the single best pacing fix in the genre), characters with agency, undo | Full dynasty simulation is out of scope for v1; single-era setting |
| Ara: History Untold | Simultaneous turn ambition, crafting depth | Simultaneity's readability cost in single-player |

## The five chronic problems — and our answers

These are the genre's known, decades-old failures. Each has a specific,
committed design answer, detailed in doc 02.

1. **The late-game slog.** Answer: the **Governance capacity** system (manual
   interventions are a budgeted resource, automation is first-class and
   trustworthy) plus the **Final Act** — the endgame is a designed climax with
   its own tension, not 80 turns of clicking "next turn" toward a foregone
   conclusion.
2. **Snowballing / game decided by turn 150.** Answer: **Turning Points** at
   era transitions — world events that create asymmetric opportunities
   favoring trailing players — plus rising administrative friction for
   runaway empires. Catch-up mechanics that feel like history (plagues,
   reformations, revolutions), not rubber-band charity.
3. **Unit carpet micromanagement.** Answer: **Commanders and formations** —
   land armies fight as commanded formations occupying one tile with
   deployment rules, giving tactical depth back without hex-by-hex traffic
   jams, and giving the AI a war it can actually fight.
4. **The AI can't play its own game.** Answer: the AI is a headline feature
   with its own design doc (03), a deterministic sim it can search, and a
   continuous AI-vs-AI harness so every rules change is validated against
   thousands of headless games. Difficulty comes from decision quality first.
5. **Victory as an afterthought.** Answer: **living victory tracks** — every
   victory condition is a visible, scored race from turn 1 with milestones
   that pay out along the way, so players (and the AI) pursue arcs, not
   endgame sprints.

## Design pillars

Every feature decision gets tested against these six pillars. A feature that
violates a pillar needs an extraordinary justification or it's cut.

1. **One more turn, all game long.** Pacing is the product. Anything that
   makes a turn longer must make it more interesting by at least as much.
2. **Decisions, not chores.** If the optimal play is repetitive, the system
   is wrong. Automate the routine; reserve the player for the interesting.
3. **A worthy opponent.** The AI plays the same game, visibly wants things,
   and can be negotiated with, deterred, and outplayed — not just out-cheated.
4. **Radical legibility.** Every number derivable, every reaction
   inspectable, every rule stated in-game. Depth through interacting simple
   rules, not hidden formulas.
5. **The map is the game.** Terrain, rivers, climate, and geography drive
   strategy. Cities grow out of their land; wars are shaped by chokepoints;
   the world itself changes across eras.
6. **Yours to keep and change.** Deterministic, replayable, seed-shareable,
   and data-driven moddable from the first milestone — not as post-launch
   promises.

## Considered and rejected (on the record)

- **Civ-switching between eras** (Civ VII / Humankind). Rejected: continuity
  of identity is the core fantasy. Era transitions transform your civ; they
  never replace it.
- **Full character/dynasty simulation** (Old World). Deferred: Great People
  get more agency than in Civ VI, but a courtier layer is v2 material. The
  data model won't foreclose it.
- **Simultaneous turns in single-player** (Ara). Rejected for SP readability;
  the deterministic command-log core keeps simultaneous resolution possible
  for multiplayer later.
- **Real-time or WEGO hybrid.** Rejected. This is a turn-based game.
- **Procedural narrative text generation at runtime.** Deferred; scripted
  event content first, so tone stays controlled.

## A note on the name

"Civilization VIII" is this project's working title. *Civilization* is a
trademark of Take-Two/Firaxis; if this project is ever distributed publicly it
ships under an original name. Nothing in the design depends on the title.
