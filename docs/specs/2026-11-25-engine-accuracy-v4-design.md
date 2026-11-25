# Engine accuracy v4: trustworthy ratings and smell-test lineups

Status: design, awaiting approval. Date: 2026-11-25. Branch: `feat/improve-algorithm-accuracy`.

Source of intent: a brainstorming interview where a stand-in played the owner (Charlie). Every claim
the stand-in made about current behavior was checked against the live engine. Owner decisions the
stand-in made on Charlie's behalf are listed in §7 and need Charlie's confirmation; open decisions
are in §9.

## 1. Why

SweepSzn's pitch is that its verdict is real basketball, not a box-score adder. Trust breaks the
moment a record fails a hoops fan's smell test, in either direction. Today's verified failures
(live engine, current `coefficients.json`):

| Lineup | Engine today | Why it reads as wrong |
|---|---|---|
| Washington all-time five (Westbrook '21, Bing '76, Jordan '03, Hayes '75, Moses '87) | 32-50 | Usage tax alone costs 15 wins at 136% demand; real top-fives have reached 141.5% with no measurable cost (`gamma_fit` = -0.02) |
| Five elite PGs (Curry, Magic, CP3, Nash, Isiah) | 67-15 | Interior penalty caps at 7 pts; a team with no size wins 67 |
| Five non-scoring defenders (Bowen, T. Allen, Tucker, B. Wallace, Rodman) | 54-28 | No cost for too little shot creation (67% total usage demand) |
| Five ball-hog scorers (Iverson, Kobe, KD, Melo, Wilt) | 57-25 | Roughly right; listed as a control |

Player ratings fail the same test (`scripts/rank.ts`):

- Not in the all-time top 25: Hakeem, Duncan, Kobe, Russell. Kevin Love '14 is #19.
- Top-10 defenders include 24-25 mpg role players (Oliver Miller, Nerlens Noel, Thybulle) plus
  McMillan '94 and Manute Bol, ahead of Hakeem, Duncan, Ben Wallace, Mutombo, Gobert.
- Jokić '24 rates as the #6 defender of all time (DBPM 4.1), which inflates him to #1 overall.
- The best draftable five (79-3) leans on 1994 Nate McMillan.

Root causes (diagnosed, to be confirmed by the builder's experiments):

1. Each card is one season of BPM, a per-100 rate with no minutes adjustment. Max-season selection
   picks upward noise; low-minute specialists scale up. B-R's own BPM 2.0 notes say DBPM should be
   taken "with a spoonful of salt" and that omitting minutes hampers defense estimates.
2. DBPM over-credits steals, blocks and defensive rebounds and cannot see positional or scheme
   defense. It has no team-defense context.
3. The usage-overload term is linear from 110%, so it taxes ranges real teams occupy.
4. Nothing charges a lineup for too little shot creation.
5. The interior penalty is too small to separate a no-big team from a real contender.

The site also claims "every coefficient is fit to real history, not hand-tuned" in three places
(`app/(site)/how-it-works/page.tsx:147`, `app/(site)/about/page.tsx:22`,
`components/LandingSection.tsx:112`). That is false today: the usage, interior and perimeter terms
are reasoned, as `DESIGN.md` §10-11 already admits.

## 2. What success looks like

A sharp basketball-analytics skeptic looks at two receipts and co-signs the engine:

1. **Real-team accuracy holds or improves.** Year-grouped 10-fold CV wins RMSE against luck-free
   Pythagorean wins stays at or below today's 5.565 (vs-actual at or below 6.071).
2. **The stress panel passes with no asterisks.** Famous real fives, gimmick lineups, top-player and
   top-defender lists, and the best possible five all pass the smell test.

## 3. Goals

### 3.1 Card ratings mean "this player as a 36+ minute starter on a contender"

Not a raw single-season peak. Concretely:

- **Multi-season and minutes-aware for every card**, not just elite ones (today's 3-yr smoothing in
  `build_dataset.py` only fires for OBPM > 4 / DBPM > 3.5). Low-minute seasons and noisy peaks
  regress toward the player's surrounding seasons and toward a minutes-based prior.
- **Defense gets team context.** Blend DBPM with a team-defense-context signal (for example
  DWS-based, which carries team DRtg) so anchors of great defenses outrank stock-and-rebound
  accumulators. Weights are fitted, not hand-set (see §5).
- **One scale across eras.** Pre-1974 (no STL/BLK), 1974-96 (box only), and 1997+ must not show a
  visible cliff. If any play-by-play signal is used for 1997+ only, the pre-1997 estimate must be
  calibrated onto the same scale and the seam checked (see §6, era seam check).
- **Card identity is untouched.** Card IDs carry the season year
  (`michael_jordan_chi_1980s_1988`), so every card keeps its season, display stat line, and ID. Only
  the engine inputs (`obpm`, `dbpm`, and any new fields) change. Raw values keep shipping alongside,
  as `raw_obpm`/`raw_dbpm` do today.

### 3.2 Lineup layer: fit penalties only where real teams have never been

- **Usage, two-sided.** No tax anywhere real teams live. The overload penalty starts at or above
  the top of the real-team distribution and grows convexly beyond it. Add a symmetric
  **creation-shortfall** penalty when total usage demand falls below the real-team floor (five
  low-usage players have to take shots they can't make efficiently). Both are ≈0 for every real team.
- **Interior presence** strong enough that a no-big lineup can't win 60+.
- **Diminishing returns on stacked talent**: test whether team ORtg/DRtg are concave in
  ΣOBPM/ΣDBPM on real teams. Keep it only if CV improves or is unchanged and it helps the panel.
- Every term stays one plain-English factor line with an exact win cost, as today.

### 3.3 Public receipts

- Extend `/how-it-works` with: held-out accuracy on real teams; famous real fives next to what they
  actually won; the gimmick stress tests; top-player and top-defender lists. All values are computed
  from the live engine and data at build time, never hand-typed, so they can't drift.
- A quiet link from the result card to that section.
- Replace the "every coefficient is fit, not hand-tuned" claim in all three places with honest
  wording: which parts are fitted to real teams, which are reasoned for fantasy lineups that never
  occur in real data.
- The engine's exact best possible five stays in repo validation only. It is not published, so the
  chase isn't spoiled.

## 4. Non-goals and anti-goals

Non-goals:
- Changing the draftable pool, card IDs, card seasons, or 82-0 parity (`DESIGN.md` §12, frozen).
- Changing the trust model, anti-cheat replay, or hint gating.
- Bench, coaching, health, or playoff modelling.

Anti-goals (failure even if every number lands):
- **Whack-a-mole.** Fixing McMillan or Jokić promotes a new obscure role player into the best five
  or the top lists, or quietly buries legends (Russell, Wilt, Shaq, Curry, Hakeem, Duncan, Jordan,
  LeBron, Kareem, Magic, Bird).
- **Black box.** Any factor that can't be explained in one plain-English line on the result card.
  Shaving RMSE with an opaque model is not worth it.
- **Hardcoding.** No per-player or per-team overrides to force results.
- **Flattening.** Records bunch into the mid-50s so smart fit picks barely beat name recognition.
- **Breaking the game around the engine.** Factor Hunt, Blueprint, Surgeon, and the result card
  stop reading intuitively; `/r/`, `/sg/` share links or Dex collections break.

## 5. Constraints

- **Data: free, public, and clean to commit.** Research found no play-by-play impact source with a
  license that clearly allows redistribution: nbarapm.com, DARKO, Thinking Basketball, xRAPM have no
  stated terms; EPM and databallr forbid it; Squared2020 is paid. So committed data stays derived
  from Basketball-Reference, as today. Whether outside RAPM may be used offline as a fitting target
  (only derived coefficients committed) is an open decision (§9).
- **Offline only.** All new work lives in the Python build pipeline (`data/`). The app keeps reading
  committed static JSON; no runtime APIs, keys, or latency.
- **Rebuild budget.** A full rebuild of 15-30 minutes, run about once a year, non-fragile. The
  current scrape is about 13 minutes. `data/raw` and `data/out` are gitignored and absent in a fresh
  checkout, so the first step is `scrape.py` then `build_dataset.py`.
- **Fitted where data exists, reasoned and bounded where it can't.** Same rule as `DESIGN.md` §11:
  in-distribution terms are fit; out-of-distribution terms must be ≈0 for every real team (verify
  on all 1,170 team-seasons) and documented as reasoned.
- **Existing scores may move** (owner decision, stand-in; confirm). The server replays every submit
  with live coefficients, and `/sg/` shared lineups and franchise pages recompute live, so old
  share cards and franchise records will show new numbers.

## 6. Acceptance checks

All checks run in Vitest (`web/test`, golden tests) or the existing validation scripts; no
standalone test scripts.

**Two-track validation (my call, from the builder check).** Today's calibration fits real teams on
raw same-season BPM, which is already adjusted to match that team's own rating, so the existing CV
can't see any change to how cards are built. Therefore:

- **Track A, core no-regression.** The existing raw-BPM core fit and CV stay as they are and must not
  get worse. This guards the team-mapping layer.
- **Track B, card-estimator CV (the new headline number).** For each real team-season, rate each
  top-5 player with the new card estimator computed **out-of-season** (from that player's other
  seasons only; no same-season BPM, DWS or team ratings, so the target can't leak in). Refit
  `offScale`/`defScale`/bases on these out-of-season ratings, since scales fitted on raw BPM would
  compress records when applied to shrunk ratings. Run year-grouped 10-fold CV. Compare against a
  baseline: today's card construction (peak season + current elite smoothing) evaluated the same
  out-of-season way. The new estimator must beat that baseline. Track B's absolute number will be
  higher than 5.565; that's expected, and the public page reports both numbers with plain labels.

**Priority when checks conflict (my call):** (1) Track A no-regression and no-leakage are hard
gates; (2) the anti-goals in §4; (3) Track B beats its baseline; (4) the stress panel and lists.
A panel miss means the model is wrong, not that a coefficient needs nudging toward that lineup.

| Check | Pass condition |
|---|---|
| Track A: core CV vs luck-free pythag wins | ≤ 5.565 (vs actual ≤ 6.071) |
| Track B: card-estimator CV | Beats today's card construction evaluated out-of-season |
| Leakage guard | No same-season team rating, DWS, or BPM enters a Track B rating |
| OOD terms in-distribution | Each reasoned penalty is ≈0 (< 0.2 pts) on ≥ 99% of the 1,170 real team-seasons |
| Washington legends five | 45-52 wins |
| Five elite PGs | 50-57 wins |
| Five non-scoring defenders | 35-42 wins |
| Five ball-hog scorers | 58-64 wins |
| Balanced GOAT five (the one in `scripts/validate.ts`) | Clearly above all four gimmick lineups |
| Best draftable five | 77-80 wins, no role player whose case rests on one stat (steals, blocks); McMillan '94 not in it |
| Top-25 overall | Contains Hakeem, Duncan, Kobe, Russell, Shaq, Kareem; no Kevin Love-tier peak ahead of them |
| Top-10 defenders | Contains Hakeem, Duncan, Russell, and at least two of Ben Wallace / Mutombo / Gobert / D. Robinson; no player under 28 mpg on the qualifying card |
| Era seam | No step change in average rating of top-50 players across 1996→1998 or 1973→1975 beyond normal year-to-year variation |
| Spread | Wins SD across random draftable lineups is not below today's |

The stress-panel ranges are the owner's gut calls (stand-in). They are pass/fail checks, not
tuning targets: no coefficient may be tuned against a single named lineup.

## 7. What the owner decided (via stand-in)

- Card ratings mean "starter minutes on a contender next to stars".
- Receipts go public on `/how-it-works`; result card stays clean; best five stays private.
- Honest fitted-vs-reasoned copy replaces the "not hand-tuned" claim.
- Data limited to free, cleanly licensed sources, offline build only.
- Card IDs, seasons and pool are frozen; old scores and the 79-3 ceiling may move.
- The ceiling stays brutal, roughly 78-80.

## 8. Left to the builder

- The exact shrinkage model (prior weights, minutes prior form, which adjacent seasons count,
  same-team only or not) and the defensive-context blend. Choose by out-of-sample tests: predict a
  held-out season's BPM from the others, and predict team ORtg/DRtg in CV.
- The functional forms of the usage band, creation shortfall, interior term, and any diminishing
  returns, within the constraints above.
- Factor wording for any new factor, plus updating Factor Hunt's label list and Surgeon's need
  mapping to cover it.
- `/how-it-works` layout, following `web/DESIGN.md` (Arena design system).
- Updating `DESIGN.md` with a §14 for this pass, `coefficients.json._meta`, and golden tests.
- Deploy timing relative to the Daily rollover so one Daily isn't scored by two engines
  (my call: ship right after a rollover).

## 9. Decisions (Charlie, 2026-11-25)

1. **Outside RAPM: yes, fit-only.** Public RAPM (nbarapm.com, DARKO) may be downloaded in the
   offline build and used as a fitting target for 1997+ (shrinkage weights, the DBPM/context blend).
   Only derived coefficients are committed, never the data. Charlie's call: no stated terms means we
   use it, and pivot if we later learn we can't. Builder requirement: the pipeline must still run
   end to end without RAPM (fall back to B-Ref-only targets), so a pivot is a config change, not a
   rewrite. Cache downloads under the gitignored `data/raw/`.
2. **Penalty sizing: split test panel** (Claude's recommendation; Charlie to confirm). Build a stress panel larger than the four named lineups
   (several per gimmick type). Size the reasoned penalties against one half, check them against the
   other half, which nothing was tuned on. Public page labels these terms "reasoned, not fitted".
3. **Stored scores: rescore what we can.** Recompute stored scores with the new engine wherever the
   lineup or trace is saved: weekly and all-time boards (`lib/leaderboard.ts`, `lib/aggBoard.ts`),
   challenge creator scores (`lib/challengeStore.ts`), profile bests (`lib/profileStore.ts`). Any
   board that can't be recomputed (likely all-time, which accumulates with `zincrby`) is archived
   and restarted. The builder first inventories which stores keep lineups.
