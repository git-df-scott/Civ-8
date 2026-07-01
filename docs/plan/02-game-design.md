# 02 — Game Design Document

This is the systems bible. Doc 01 says why; this says what. Doc 04 says how
it's built; doc 05 says in what order. Numbers given here are opening values
for the balance harness, not commitments.

## 1. Core loop

Turn-based, sequential turns (player, then each AI, with simultaneous-ready
architecture underneath). One standard game: **330 turns** across **6 eras**
on Standard speed; Quick (220) and Epic (500) supported at data level.

The loop at three scales:

- **Per turn:** review alerts → spend Governance on interventions → move
  armies/agents → advance research/civics choices when prompted → end turn.
- **Per era:** pursue era goals on the victory tracks → navigate the Turning
  Point crisis/opportunity → emerge transformed into the next era.
- **Per game:** scout → settle → specialize → compete on victory tracks →
  survive the Final Act → win (or lose watching someone else win, which must
  also be dramatic).

## 2. The world

### 2.1 Map

- **Hex grid**, cylindrical wrap east-west, pole caps. Sizes: Duel (56×36)
  through Huge (128×80).
- **Terrain** is layered: base (grassland, plains, desert, tundra, snow,
  coast, ocean) × relief (flat, hills, mountains) × feature (forest, jungle,
  marsh, reef, oasis, floodplain) × resource.
- **Navigable rivers** are real edge-following features; riverine cities and
  river warfare matter from the Ancient era.
- **Climate bands and geology drive worldgen**: plate-tectonic landmass
  generation, rain-shadow deserts, river systems flowing downhill to the sea.
  Maps must *read* as plausible worlds — geography is strategy (Pillar 5).
- **The living map:** volcanoes, floods, droughts, and storms from era 1;
  from the Industrial era, an emissions-driven climate layer (sea-level rise,
  intensifying weather) that is a strategic system, not a morality tale.

### 2.2 Starting positions

Guaranteed-viable starts (worldgen post-pass scores and repairs starts), but
*not* equalized starts — asymmetry is content, and the Turning Point system
(§4) is the fairness mechanism, not spawn homogenization.

## 3. Cities & empire

### 3.1 Founding and growth

Settlers found cities; cities claim territory by culture. Population grows
from food surplus. **Urban fabric:** as a city grows it physically expands —
population is placed onto worked tiles and into **quarters** (see below), so a
metropolis visibly sprawls. City count is limited by Governance (§3.4), not by
arbitrary happiness nukes: wide is possible, but administration is the cost.

### 3.2 Quarters (the district system, evolved)

Civ VI's districts made geography matter; we keep that and cut the
spreadsheet. A **quarter** is a specialized urban tile (Campus, Forum, Harbor,
Garrison, Foundry, Temple, Theater, Laboratory…, era-gated). Key changes:

- Quarters are **built by growth, not production**: when a city hits a
  population threshold you choose what the new quarter becomes and where.
  Cities develop by growing — no competing with units/wonders for hammers.
- **Adjacency is coarse and legible**: three tiers (poor/good/excellent)
  shown at placement time, driven by a handful of readable rules (Campus
  wants mountains/reef; Harbor wants coast+resources), not +0.5 micro-bonuses.
- Buildings slot **into** quarters and are the production-queue content.
- Wonders occupy tiles, have placement requirements, and are visible on the
  map at scale.

### 3.3 Yields

Six core yields: **Food, Production, Gold, Science, Culture, Influence**,
plus **Faith** unlocked by religion play. Influence is the diplomatic
currency (treaties, city-state patronage, world congress) — diplomacy runs on
a budget like everything else. Every yield tooltip decomposes to source lines
(Pillar 4).

### 3.4 Governance — the anti-slog engine

The single most important economic system in the game.

- Each turn the empire produces **Governance points** from its government,
  civics, palaces, and courts.
- **Manual interventions cost Governance**: re-targeting a city's citizen
  placement, rush-buying, changing a build queue mid-item, micro-adjusting
  trade routes, issuing precise army orders beyond a stance.
- **Standing policy is free**: every city and army has rich, trustworthy
  policy settings ("grow", "produce military", "defend the border",
  "prioritize science") executed by the same planner the AI uses — so
  automation is provably competent, because it *is* the AI.
- Governance income grows with government tech, so the intervention budget
  scales — but never as fast as a sprawling empire's surface area. A
  20-city empire runs on policies plus a few sharp interventions per turn;
  that is the *intended* play pattern, and it keeps time-to-decision flat.
- Difficulty knob: none. Governance is identical for AI and human.

### 3.5 Stability

Local (per-city) stability from amenities, culture, garrisons, distance, and
war-weariness. Low stability → unrest → revolts that can flip cities to a
rival or spawn **Free Peoples** (independent factions, §9). Stability is the
brake on conquest sprees: taking cities is easy, *keeping* them is the game.

## 4. Time: eras and Turning Points

Six eras: **Ancient, Classical, Medieval, Renaissance, Industrial, Modern**
(the Modern era runs to the near future; a seventh "Future" band is
post-launch content space).

- Era advance is **per-civ** (by tech/civic thresholds), but each era has a
  **world clock**: when enough civs (or the turn count) cross it, a global
  **Turning Point** resolves.
- A Turning Point is a designed world event with teeth: the Bronze Age
  Collapse, the Plague, the Reformation, Revolutions, the World Wars sequence,
  the Information Revolution. Each one:
  - hits **leaders harder than laggards** (plague spreads along the trade
    routes the leader is rich with; revolutions target the biggest empires'
    stability) — this is the honest catch-up mechanic;
  - offers each civ a **choice of response postures** with real trade-offs;
  - reshuffles part of the board (new units matter, old walls don't, a
    yield's economy shifts) so mid-game strategy must adapt.
- **No resets**: nothing the player built is deleted or replaced. Your civ
  persists; it *transforms* (a Turning Point may convert obsolete quarters,
  age units, or rewrite a civic slot — always visibly, always with choices).

## 5. Science & culture

Two trees, two personalities:

- **Technology tree**: ~75 techs, mostly linear-with-branches; boosted by
  **Practice** — using a system accelerates its research (sail = coastal
  play; metallurgy = mining). Practice replaces Civ VI eurekas: continuous
  multipliers earned by *how you already play*, not a checklist of stunts.
- **Civics loom**: civics are researched with Culture, and unlock **policy
  cards** slotted into your **government**. Governments (Chiefdom → …→ modern
  forms) define slot layouts and Governance income. Switching government is a
  Turning-Point-scale decision with a transition cost (brief instability),
  not a free respec.

Tech/civic costs scale with era, not with how many you've researched, so tall
science empires feel fast rather than treadmilled.

## 6. Military & war

### 6.1 Commanders and formations — the end of the carpet

- Individual land units exist (they're built, upgraded, and have identity),
  but in the field they attach to a **Commander** and fight as a
  **formation**: one map entity of up to N units (N grows by era: 2 → 6).
- A battle between formations resolves on a **deployment ribbon**: front
  line, flanks, support, reserve — assignment matters (spears front, archers
  support, cavalry flank), terrain of the battle hex and its neighbors
  matters, commander traits matter. Resolution is deterministic-with-seeded-
  rolls and fully previewable as odds before committing.
- Small wars stay small: solo units can garrison, escort, and skirmish
  without commanders. Big wars are a handful of armies with names and
  histories, not forty units in a traffic jam.
- **Why this wins:** tactical depth per decision goes *up*, decisions per war
  go *down*, and — decisive for Pillar 3 — an AI can command 5 armies well;
  no AI has ever commanded 40 loose units well.
- Naval and air forces use the same commander pattern (fleets, wings).

### 6.2 The shape of war

- **Zone of control**, supply (armies far from friendly territory attrit),
  sieges (walls make cities a formation-scale problem; siege support units
  unlock assaults), pillaging with real economic sting.
- **War support & grievances** (successor to warmonger penalties): wars run
  on a visible war-support meter fed by grievances, war goals, and victories.
  Declaring with cause (formal war goals) is sustainable; naked aggression
  collapses your stability and diplomatic standing. All of it is numbers the
  player can read (Pillar 4).
- **Peace deals are priced**: an honest evaluator scores cities/gold/terms
  for both sides, so AI peace offers are neither absurd nor exploitable.

## 7. Diplomacy

- Leaders have **personalities + two agendas** (one fixed and public, one
  situational and discoverable). Opinion is an itemized ledger, always
  inspectable: every modifier, its size, its decay.
- **Influence economy**: treaties, open borders, research pacts, defensive
  pacts, tribute demands, and city-state patronage all cost/earn Influence.
- **Deals are commitments**: promise-tracking with escrow — breaking deals
  torches your **Credibility**, a visible stat that scales what others will
  agree to. The AI remembers, and the player can see exactly what it
  remembers.
- **World Congress** unlocks in Renaissance: session-based votes on real
  levers (embargoes, war legitimacy, climate accords, victory-relevant
  resolutions), Influence as the voting currency. No random resolution roulette:
  agenda-setting is itself a competitive act.

## 8. Religion, espionage, trade

- **Religion:** founded via Faith from early quarters/wonders; belief picks
  build a bespoke religion (economic, cultural, or militant flavors). Spread
  is passive along trade routes + active via missionaries. **No theological
  combat mini-carpet** — contested cities resolve pressure abstractly.
  Religion feeds the Culture victory track and unique casus belli, and stays
  relevant post-Renaissance through secularization choices at Turning Points.
- **Espionage (Modern-era ramp):** agents are scarce (2–5 for a whole game),
  named, and leveled. Missions are targeted heists/ops with previewed odds
  and counterplay (counter-intelligence postures), not a fiddly sub-game.
- **Trade:** trade routes are drawn on the map, generate yields for both
  ends, spread religion/culture/plague, and are raidable. Route count is
  capped by infrastructure; assignment is a policy (automatable) with
  intervention override.

## 9. The world's other people

- **City-states** with typed bonuses and suzerainty via Influence
  competition, quests that make sense for their type, and levy-able armies.
- **Free Peoples**: barbarians, evolved. Independent factions with
  settlements, dispositions (raiders, traders, refugees), and a path to
  either integration (Influence/conquest) or eruption into real threats when
  ignored. Early-game pressure that doesn't evaporate into irrelevance.

## 10. Great People

Earned on era-scoped candidate lists via yield-specific points. Each Great
Person is a **charged agent with a choice of two effects** (a Great Scientist
might grant a tech Practice surge *or* found a unique Laboratory quarter) —
agency over raw numbers. Names/portraits are data-driven for moddability.

## 11. Victory — living tracks and the Final Act

Five victory conditions, each a **visible race track from turn 1** with
scored milestones that pay out along the way (so pursuing a victory is
rewarding even if you pivot):

1. **Domination** — control every original capital (classic, unambiguous).
2. **Science** — the space project chain, gated on real infrastructure
   (Laboratories, aluminum/power logistics), sabotage-able via espionage.
3. **Culture** — accumulate Legacy (wonders, art, tourism pressure) until
   your civilization defines the world's imagination; contested by other
   civs' domestic culture, readable as a per-civ progress bar (no hidden
   tourists math).
4. **Diplomatic** — earn the Congress's mandate across a sequence of
   era-spanning resolutions and a final ratification vote.
5. **Score/Time** at turn cap, so every game has an ending.

**The Final Act:** when any civ crosses a victory track's final-phase
threshold, the game announces it globally and enters a designed endgame: the
leader gets a concrete, defensible objective with a timer; everyone else gets
targeted counterplay tools (a casus belli against the leader, espionage
options, congress emergency sessions). The last 30 turns of a game are its
most dramatic — by construction, for every player at the table.

## 12. Civilizations & leaders

- **Launch roster: 12 civs / 14 leaders** (two civs with alternate leaders),
  chosen for mechanical spread and global breadth. Each civ = 1 unique
  ability + 1 unique unit + 1 unique quarter-or-improvement; each leader = 1
  ability + agenda + personality weights. Uniques bend the rules ("your
  Harbors claim adjacent ocean tiles"), never just +X%.
- Civ design is **pure data + scripted hooks** (doc 04), so the roster grows
  cheaply and modders can add civs without touching engine code.
- **Vertical-slice roster** (roadmap M4): Rome, Egypt, Mongolia, Korea —
  covering wide-military, wonder-tall, cavalry-aggression, and science-tall
  archetypes for balance testing.

## 13. Difficulty & the first hour

- Difficulty levels adjust **AI decision-quality budgets and Free Peoples
  aggression first**; flat AI yield bonuses exist only at the top two levels
  and are printed on the tin (Pillar 4: even the cheats are legible).
- **Advisor layer** for new players: plain-language turn suggestions from the
  same planner that powers automation, toggleable, never modal.
- Full-game **undo to start-of-turn** (deterministic core makes this free)
  in single-player below the highest difficulty — the genre's kindest
  learning tool, straight from Old World.

## 14. Out of scope for 1.0 (explicit)

Networked multiplayer (hot-seat ships; lockstep netcode is architecturally
preserved — doc 04), the seventh era, full character/dynasty layer, map
scripts beyond continents/pangaea/archipelago/fractal, scenario campaigns,
and console/touch UI. Each has a reserved seam in the architecture.
