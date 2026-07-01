# 03 — AI Design

The AI is a headline feature of Civilization VIII, not an afterthought. This
doc covers the AI as the player experiences it and the architecture that makes
it tunable. The genre's dirty secret is that no mainstream 4X AI can play its
own game; ours is designed, from the sim core up, so that it can — and so
that we can *prove* it, continuously, with data.

## 1. Design goals

1. **Competence without cheats** on default difficulty: the AI plays by the
   player's rules and is a threat because it plays well.
2. **Personality that reads**: each leader wants visible things and pursues
   them consistently; two Napoleons in two games feel like the same person on
   different maps.
3. **Legibility**: the player can always inspect *why* — opinion ledgers,
   stated agendas, war goals, congress positions.
4. **Tunability at scale**: every AI behavior is a scored, weighted decision
   that the balance harness can measure across thousands of headless games.

## 2. Why this game's AI can be good when others weren't

Three deliberate design choices in doc 02 exist substantially *because* they
make strong AI feasible:

- **Formations, not carpets** (02 §6.1): commanding 5 armies is a tractable
  planning problem; commanding 40 loose units was the rock every 1UPT AI
  died on. Battle resolution on the deployment ribbon is a small, searchable
  decision space.
- **Policy-driven cities** (02 §3.4): the automation planner that runs the
  player's cities *is* the AI's city brain. One engine, doubly tested — every
  player who automates is QA-ing the AI economy, and the AI economy is
  exactly as strong as the player's automated economy.
- **Deterministic sim** (doc 04): the AI can cheaply roll out candidate moves
  against the real rules engine, and we can regression-test its skill because
  identical seeds give identical games.

## 3. Architecture: three layers, utility-scored

A layered utility-AI (no monolithic behavior trees; weights over hand-coded
branches so behavior is data-tunable):

- **Strategic (per ~10 turns):** chooses the civ's *posture* — victory track
  to pursue, expansion appetite, military stance, key rivals/friends — by
  scoring postures against personality weights, map reality, and victory
  progress. Output: a small set of standing goals.
- **Operational (per turn):** turns goals into plans — settle target queues,
  war plans (target city sequences, army composition requests), diplomacy
  moves, congress strategy, Governance spending. Uses the same city-policy
  planner exposed to players.
- **Tactical (per action):** army movement/deployment-ribbon assignments,
  agent missions, per-battle decisions. Bounded lookahead using the
  deterministic core (evaluate candidate orders → score resulting states).

Every scorer's weights live in data files. Difficulty scales the tactical
lookahead budget and strategic re-planning frequency — *decision quality* —
before it touches a single yield.

## 4. Personality system

Each leader = a vector of ~15 personality weights (expansion, aggression,
loyalty, forgiveness, risk, wonder-lust, naval-mindedness…) + 2 agendas
(02 §7) that inject opinion modifiers and posture biases. Weights are data;
new leaders are content, not code. Personalities are validated in the
harness: Genghis must actually conquer more than Gandhi across 1,000 games,
or the weights are wrong.

## 5. Legibility features (player-facing)

- **Opinion ledger**: every diplomatic modifier itemized with size and decay.
- **Stated intent**: leaders announce postures through envoys/warnings
  ("Rome covets your border cities") — real signals from the strategic
  layer, not flavor text.
- **Credibility both ways**: the AI tracks the player's broken promises; the
  player sees the AI's promise history on the same screen.
- **Advisor = AI**: the new-player advisor surfaces the operational layer's
  top-scored suggestion for the player's own empire, with its reasoning.

## 6. The harness: AI-vs-AI as the balance instrument

The single most important tool in the project (built at roadmap M5, used
forever):

- Headless runner plays N full AI-vs-AI games from seed lists at high speed
  (no rendering; deterministic core), emitting structured telemetry per game:
  winner, victory type, turn counts, yield curves, war outcomes, era timing.
- **Nightly CI sweep** (hundreds of games) guards balance invariants:
  - every victory type wins within a target share band on standard settings;
  - no civ's win rate leaves its band;
  - median victory turn stays inside the pacing window;
  - skill ladder sanity: higher decision-budget AI beats lower ≥ X% of games.
- Every rules/data PR ships with a harness delta report. Balance discussions
  happen over distributions, not vibes.
- The same harness replays saved command logs bit-for-bit as the determinism
  regression suite (doc 04, doc 06).

## 7. What the AI will not do

No reading the fog (information rules apply to AI sight), no ignoring supply
or Governance costs, no free units on default difficulty, no diplomatic
amnesia patches — if a system is too fiddly for the AI to use, doc 02 gets
amended, because that system was too fiddly for humans too. That feedback
loop — *AI playability as a design lint* — is how the whole game stays honest.
