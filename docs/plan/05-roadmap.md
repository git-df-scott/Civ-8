# 05 — Roadmap: M0 → M13

Fourteen milestones from empty repo to 1.0. Every milestone is independently
buildable, headlessly testable, and demoable in the browser; each closes only
when doc 06 §5's Definition of Done holds. "AC" = acceptance criteria —
concrete, observable, no vibes. The sequencing principle: **reach a complete
playable game by M5, then layer systems onto a thing that always works.**

Nothing below starts until the project owner gives the green light.

---

### M0 — Scaffold & CI (the walking skeleton)
**Goal:** every pipeline that will ever matter exists on day one, minimally.
**In:** pnpm monorepo per doc 04 §2; tsconfig/eslint/prettier/depcruise; an
empty-but-real engine (`Game` with `EndTurn` only, PCG32, hash, canonical
serialize); Vite app rendering a Pixi "hello hexagon"; `cli sim` running 10
empty turns; full GitHub Actions CI including one Playwright test.
**Out:** any game rules.
**AC:** `pnpm ci` green locally and on Actions; `sim --seed 1` prints an
identical final hash on two runs; Playwright screenshots the hexagon;
depcruise demonstrably fails a deliberate engine→pixi import (tested red,
then removed).

### M1 — Deterministic engine core
**In:** full GameState/Command/Event skeleton; RNG substreams; save/load;
migration framework (v0); fast-check replay & round-trip properties;
golden-log harness; `docs/determinism.md`.
**AC:** replay-identity and save/load-transparency properties pass over 500
generated runs; a save created, reloaded, and replayed matches its hash chain.

### M2 — The world: mapgen & rendering
**In:** axial hex math; typed-array MapState; mapgen stages (landmass →
elevation → climate → biomes → rivers-on-edges → features → resources →
validation); chunked Pixi terrain rendering; pan/zoom camera;
`mapgen-preview` PNG tool; per-stage mapgen snapshots; pan-perf Playwright
bench (baseline recorded).
**Out:** start-position fairness pass (needs civs); fog.
**AC:** `mapgen --seed 7 --size huge` produces a plausible continents map
(PNG artifact in CI); same seed ⇒ pixel-identical PNG; 60fps pan on a huge
map per the tracing test.

### M3 — Units, movement, fog
**In:** unit entities from `units.json` (scout, warrior); MoveUnit;
A* + reachable-tiles + ZOC; per-player fog with remembered tiles;
`PlayerView`; unit rendering, move animation, selection & right-click-move UX.
**AC:** in the browser, select a scout, see its range, move it over 5 turns
revealing fog; Playwright asserts revealed-tile count grows; ZOC unit-test
table passes; pathfinding bench under budget.

### M4 — Cities, quarters, economy
**In:** settler unit; FoundCity; tile yields; food/growth; production queues; **quarters
chosen at population thresholds** with three-tier adjacency (doc 02 §3.2) —
2 quarter types + 5 buildings + 3 units to start; borders; the **city policy
planner v0** (grow/produce/balanced stances — the seam automation and the AI
economy share, doc 03 §2); Governance points *tracked* (generous budget, real
costs later); city screen + top yield bar.
**AC:** found a city, choose its first quarter placement seeing adjacency
tiers, queue a warrior, end turns until it pops and the city grows —
verifiable in browser and as a golden log; a city left on a policy
stance for 30 turns with zero interventions reaches ≥90% of a hand-optimized
scripted baseline's cumulative yields (sim assert).

### M5 — Vertical slice: combat, first AI, first victory 🏁
**Goal:** *it's a game now.* Everything after is layering.
**In:** solo-unit melee+ranged combat with exact previews; unit death; city
capture; **Domination victory**; end-game screen; **AI v1** (single-layer
utility: explore/settle/build/attack — deliberately crude but complete);
**civilizations as content** — the 4-civ slice roster (Rome, Egypt, Mongolia,
Korea) with unique units, remaining uniques landing with their systems; the
mapgen start-position fairness pass (deferred from M2); **Free Peoples v0**
(raider camps — early-game pressure); a turn-cap score ending as fallback
winner; autosave; `sim` runs full AI-vs-AI games with telemetry.
**AC:** a human can start a duel vs 1 AI in the browser and win (or lose) by
domination, end to end; `sim --seeds 1..5 --players 2` completes all games,
twice, hash-identical, with ≥4 of 5 seeds decided (domination or turn-cap
score) before turn 300; combat golden log passes. **Playthrough gate (doc 06 §4) activates here and never turns off.**

### M6 — Technology, Practice & content breadth
**In:** tech tree (~40 techs across the first 4 eras); ChooseResearch;
**Practice multipliers** (doc 02 §5) replacing nothing — built right the
first time; **era structure with per-civ era advance** (world-clock hooks
for M12's Turning Points); tech-gated units/buildings/quarters; **wonders
v1** (5 wonders with tile placement); tile improvements (farm/mine/road) via
the per-city Works queue (doc 02 §3.6); **start-of-turn undo**
(replay-powered, doc 02 §13); tech tree UI; save/load UI (IndexedDB + file
export); first real saveVersion migration.
**AC:** research Bronze Working, unlock and build a spearman in-browser;
build a wonder and see it placed on the map; undo rewinds to start of turn
and replays forward identically (hash-checked);
Practice measurably accelerates a used tech line in a scripted sim; tech DAG
content test passes; a pre-M6 golden save loads via migration; sim logs show
AI military composition changing across eras.

### M7 — Layered AI & the balance harness
**In:** full strategic/operational/tactical AI (doc 03 §3);
`ai-weights.json`; personality vectors (4 test leaders); decision logging;
**nightly 100-seed tournament** workflow with committed baseline bands;
difficulty presets (decision-budget scaling first, doc 02 §13).
**AC:** AI v2 beats AI v1 in ≥70% of 40 seeded games — the harness proves its
own value; per-PR 5-seed gate green; a weights-file change measurably shifts
tournament stats with zero code changes.

### M8 — War at scale: commanders & formations
**In:** Commanders; formation assembly/detach; the **deployment ribbon**
battle resolution with full odds preview (doc 02 §6.1); sieges & walls;
supply attrition; pillaging; **war support & grievances** with formal war
goals; priced peace-deal evaluator; AI wages commander-led wars.
**Out:** naval/air commanders (naval basic units only until M11).
**AC:** a 3-army border war plays out in the browser with previewed battles
and a negotiated peace; ≥80% of AI-vs-AI wars in the harness end in a
negotiated peace or decisive conquest (under 20% time out as stalemates); battle resolution covered by table
tests + a dedicated combat golden log; formation flows keep tactical
decisions-per-war below the M5 solo-unit baseline (telemetry assert).

### M9 — Civics, governments & Governance for real
**In:** the civics loom (~25 civics) + policy cards + 4 governments;
**Governance economy switched on** (intervention costs, income scaling —
doc 02 §3.4); stability & unrest v1; city policy planner v2 (trustworthy
enough to bet the game on); **Science victory** (space project chain); the **Score/Time victory**
formalized with its track; **Great People v1** (points, era candidate lists,
charged two-choice agents — doc 02 §10); and the **living victory-track UI**
for every track built so far.
**AC:** win a Science game vs AI in-browser; AI wins by science in ≥15% of
nightly games (it genuinely pursues it; full victory-share bands apply from
M12); a scripted zero-intervention "policies only" seat finishes in the top
half of a 4-player default-difficulty game in ≥3 of 5 seeds (the
automation-competence gate, doc 06 §7); median real time per turn at turn
250 stays ≤1.5× the turn-50 median in instrumented playtests.

### M10 — Diplomacy, Influence & hot-seat
**In:** Influence yield; opinion ledger with full itemization; deals
(peace/gold/resources/open-borders/pacts) with the honest evaluator;
Credibility & promise tracking; agendas; diplomacy screen; **hot-seat
multiplayer** (per-player fog enforcement, turn-transition privacy screen).
**AC:** AI deal behavior validated against a hand-authored fixture table of
20 fair and lopsided deals written independently of the evaluator; every opinion number on the diplomacy screen expands to its
ledger; 2-human hot-seat game where Playwright asserts zero cross-player fog
leakage; deals appear in the command log and replay deterministically.

### M11 — The wider world: religion, trade, city-states, espionage
**In:** religion (pantheon → founding → pressure/missionary spread, ~15
beliefs, no theological combat); trade routes on the map (raidable,
policy-assigned); city-states with Influence suzerainty + typed quests;
**Free Peoples** dispositions & integration paths; espionage-lite (2 named
agents, 4 mission types with previewed odds); naval commanders; **natural
disasters v1** (volcanoes, river floods, storms — the living map, doc 02
§2.1).
**AC:** found and spread a religion into a rival city in-browser; a raided
trade route visibly stings (golden log); a disaster fires, damages, and is
repaired by the Works queue (golden log); city-state levy turns a harness war;
all systems inside turn-time budget on the reference map — *this is the
milestone that historically blows performance; the bench gate is hard.*

### M12 — Turning Points, Final Act & the full roster
**In:** the world-clock Turning Point triggers finalized (era structure
ships at M6); **5 Turning Points** authored
(Collapse, Plague, Reformation, Revolutions, World Crisis) with
choice-of-posture UIs and leader-targeting logic (doc 02 §4); **Culture and
Diplomatic victories** + World Congress; **the Final Act** endgame layer
(doc 02 §11); **tech tree and civics loom completed** (~75 techs across all
six eras) with late-era military content including **air wings** on the
commander pattern; the **emissions-driven climate layer** (doc 02 §2.1 —
feeds Congress climate accords and the World Crisis); roster to **12 civs /
14 leaders**; balance freeze begins — nightly bands (doc 06 §3) become
merge-blocking.
**AC:** all five victory types occur in the nightly tournament within their
target bands; a leader entering the Final Act is beaten back in ≥25% of
harness games (comeback check); Turning Points shift the yield-curve gap
between 1st and 4th place (measured); full-game playthrough gate on every
victory type (per doc 06 §4).

### M13 — Polish, accessibility, modding, release 🚢
**In:** audio (UI feedback, era-layered music, data-driven cue table);
animation & UX polish pass driven by the fun ledger; tutorial + Civilopedia
**generated from content JSON** (free win of data-driven design); the
**advisor layer** surfacing the operational AI's top suggestion with its
reasoning (doc 02 §13, doc 03 §5); full
accessibility bar (doc 06 §2) with axe-core CI scan; performance hardening to
all budgets at 2× content volume; **mod loading** (multiple content packs,
declared load order, JSON-Schema-validated) + `docs/content-authoring.md`;
static-host release build; **lockstep multiplayer spike** (two tabs over
BroadcastChannel, per-turn hash checks, behind a flag).
**AC:** a third-party content pack adding a civ + unit + tech loads, plays,
and is used by the AI with zero code changes; release build <15MB gzipped
excluding audio; the two-tab lockstep demo runs 50 turns with zero hash
divergence; every content entry has a Civilopedia page (content test);
**v1.0 tagged with the full CI matrix green.**

---

## Post-1.0 reserved lanes (not in scope, seams preserved)

Networked multiplayer (the M13 spike graduates), the Future era, the
character/dynasty layer, more map scripts, scenario campaigns, and
touch/console UI — each has an explicit architectural seam noted in docs 02
§14 and 04.

## Sequencing rationale

- **Determinism before features** (M1): every later system inherits
  replay/golden testing for free; retrofitting determinism is a rewrite.
- **Vertical slice at M5**: from that point there is always a complete,
  shippable game — scope pressure cuts content, never the game.
- **Harness before balance-sensitive systems** (M7 before M8–M12): every
  war/economy/victory system lands with its measuring instrument already
  running.
- **Governance after automation exists** (M4 planner → M9 economy): the
  intervention budget is only fun if the free automation is genuinely good,
  so the planner gets five milestones of hardening first.
- **Turning Points last among systems** (M12): they modulate everything else,
  so everything else must exist to be modulated.
