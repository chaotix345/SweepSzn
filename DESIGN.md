# 82-0 (better version) — Game + Engine Design

A redesign of the viral 82-0.com NBA team-builder. Same addictive hook ("build a 5-man all-time lineup, can you go 82-0?"), an engine that actually models basketball instead of summing box-score stats.

This doc is the synthesis of: (1) reverse-engineering the original engine, (2) verified research on data availability + basketball analytics, and (3) three independent design passes each stress-tested adversarially.

---

## 1. What the original gets wrong (recap)

The live engine is:

```
teamOvr = 100 * ( ΣPPG/133.4*0.46 + ΣRPG/39.7*0.25 + ΣAPG/29.3*0.18 + adjSPG/6.1*0.07 + adjBPG/3.2*0.04 )
wins    = round( 82 * min(teamOvr/110, 1)^1.15 )
```

A purely **additive sum of individual per-game averages**. Its failures:

1. **Stats are treated as independent and stackable.** One ball, ~100 possessions, finite shots — five 30-PPG scorers can't all score 30. The engine doesn't know this.
2. **No era normalization in the record.** Wilt's pace-inflated 41/25 counts at face value → "cheat code."
3. **Defense is 11%** (steals+blocks only) and uses total rebounds (which include offensive boards).
4. **No fit/spacing/redundancy** — 5 PGs is fine; no rim protection is fine.

Net: it rewards stat accumulation, not winning basketball. Empirically a balanced two-way superteam (MJ/LeBron/Jokić/Giannis/Curry) scores **59-23** while ball-dominant stat-stuffers (MJ/LeBron/Oscar/Harden/Westbrook) score **74-8**. That's backwards.

---

## 2. The one principle that makes this engine good

> **Fit the engine to reality. Don't hand-set constants — regress them against real historical NBA team-seasons.**

All three design passes failed adversarial review for the same reason: guessed coefficients produced nonsense (one "best-ever" lineup projected to **23 wins**; another exploded everyone to **82-0**). The fix is not better guessing. It's calibration:

- Take real team-seasons. Run each team's actual rotation's box stats through the engine to get a predicted NetRtg / win total.
- Fit every coefficient (impact weights, usage curve, baselines, Pythagorean exponent) by minimizing error vs. those teams' **actual** Net Rating and wins.
- Ship a published **calibration table** (top-20 players, famous teams → expected output) so the math is auditable and can't silently drift.

This is the thing the original never did, and the single biggest source of quality.

---

## 3. Data

**Source (as built):** Basketball-Reference season pages (per-game + advanced + standings, 1950–2025), fetched by `data/scrape.py` at a 3.6 s throttle into a local `data/raw/` cache and parsed by `data/build_dataset.py`. The original plan was the Kaggle `sumitrodatta/nba-aba-baa-stats` snapshot; direct scraping won because it stays current and carries every column the calibration needs. Respect the throttle — B-R's terms are the reason the raw cache is local-only (gitignored) and the scraper is resumable rather than re-run casually.

**Hard availability cliffs (verified) — the engine must branch on these:**

| Stat | First tracked |
|---|---|
| Minutes played | 1951-52 |
| Steals, blocks, OREB/DREB split, team TOV | **1973-74** |
| Player turnovers | 1977-78 |
| 3-pointers | **1979-80** |
| Play-by-play / on-off | 1996-97 (clean ~2000-01) |
| Shot coordinates | 2003-04 |
| Player tracking (SportVU/Second Spectrum) | 2013-14 |
| BPM/VORP (box impact) | 1973-74 (designed for it) |
| RAPM/RPM/EPM (PBP impact) | ~2001 |

**Three data tiers** the engine respects:
- **Complete (1974–now):** full box incl. STL/BLK/DREB; BPM available.
- **Partial (1952–73):** no STL/BLK, no OREB/DREB split; has minutes.
- **Primitive (1947–51):** no minutes either.

Defense and any STL/BLK-dependent term must be **estimated, not zeroed**, for pre-1974 players — and not naively flattened to league-average either (that neutralizes Bill Russell). Use a position + rebound-rate rim-protection prior so elite early-era defenders keep their value.

---

## 4. Engine pipeline (v1)

All five concepts converged on this skeleton; the version below incorporates every adversarial fix.

### Step 1 — Era normalization via z-scores (not raw, not pace-cancelling ratios)
For each stat, convert to per-100 then standardize against that **season's** qualified-player distribution:

```
z = (player_per100 - league_mean_per100) / league_sd_per100
```

One league-relative step removes pace **and** scoring environment **and** captures how exceptional the number was (a ratio only captures the mean; z captures the spread). Cap z at ~+4 so true outliers stay elite without breaking the scale.
*Pitfall avoided:* doing per-100 **and** dividing by a per-100 league average is an algebraic no-op (the pace factor cancels). Normalize relative to the league once, full stop.
*Optional:* a modest era-strength multiplier (thin 8-team 1950s vs. 30-team global-talent today). Keep it small and document it.

### Step 2 — Per-player offense/defense impact (points per 100), coefficients FITTED
- **Offense:** scoring volume × efficiency (relative TS%, not just PPG), playmaking (AST net of TOV), offensive rebounding.
- **Defense:** DREB (not total REB), STL, BLK, + position-based rim-protection prior.
- **Use the best data per tier:** where BPM/OBPM/DBPM exist (1974+) or RAPM/EPM (2001+), anchor impact to those — they beat box proxies. Box estimate only fills gaps.

### Step 3 — Usage / possession budget (the core anti-stat-stuffing mechanism)
A lineup shares one ball and finite shot attempts. Each player has a usage demand (from historical USG%/scoring rate). The high-usage portion of each player's offense is discounted by a **smooth diminishing-returns curve** (the documented skill-vs-usage tradeoff: efficiency falls as forced usage rises).
*Pitfall avoided:* use a **continuous** curve, not tier thresholds. Every threshold-based version was either dead code (no real star ever triggered it) or gameable (draft players at 24.9 PPG to dodge the cutoff). Continuous = no cliff to game, and it fires on everyone proportionally.

### Step 4 — Fit, spacing, coverage (continuous, not hard archetype buckets)
- **Spacing:** team offense scales with lineup floor-spacing (3pt volume/accuracy), era-gated — pre-1980 players get the era's structural spacing baseline, not individual 3pt credit. Diminishing past ~3–4 shooters.
- **Role coverage / redundancy:** reward covering the functions a team needs (primary creation, secondary creation, rim protection, rebounding, spacing); penalize redundancy. Score these **continuously** from the z-vectors, not by classifying into buckets with exploitable edges.
- **Rim protection:** a lineup with none takes a DRtg hit; pre-1974 bigs qualify via position + rebound-rate proxy (the Russell fix).

### Step 5 — Team ORtg / DRtg → NetRtg
```
team_ORtg = BASE + Σ(usage-adjusted offensive impact) + spacing − redundancy
team_DRtg = BASE − Σ(defensive impact) + scheme/rim/perimeter adjustments
NetRtg    = team_ORtg − team_DRtg
```
Both baselines **equal** (an average lineup → NetRtg 0 → 41 wins). Per-player impact is **capped and the summation scaled by calibration** so a realistic best-ever lineup lands ~ +13 NetRtg, not +40.
*Pitfalls avoided:* unequal bases (every team started −4 and couldn't reach .500); uncapped sums (five all-time greats → impossible +40 NetRtg → 82-0 trivially).

### Step 6 — Wins via Pythagorean expectation
```
Win% = ORtg^k / (ORtg^k + DRtg^k)        k ≈ 14   (Basketball-Reference; Morey's 13.91 equivalent)
Wins = round(82 * Win%)
```
Cross-check: `wins ≈ 41 + 2.7 * NetRtg` (real NBA regression). The curve asymptotes near the extremes, so **82-0 is achievable but brutally hard** — it requires a near-optimal, well-fit, era-spanning roster, which keeps the hook alive while forcing real roster-building. Calibrate so only a near-perfect lineup crosses ~80. *(Superseded by §13: the verified ceiling is 80-2 — nobody reaches 82-0; the product copy uses the chase framing.)*

### Step 7 — Breakdown card (the best product idea)
Show W-L, ORtg/DRtg/NetRtg, the top 3 things helping and top 2 hurting, in plain English ("No rim protection: +4 points allowed/100"), plus a confidence note when a player's defense is estimated. This is the share asset and the trust builder.

---

## 5. Anti-exploit, summarized

| Original exploit | Killed by |
|---|---|
| Raw counting-stat inflation (Wilt) | Step 1 era z-scores |
| Stack 5 ball-dominant scorers | Step 3 continuous usage diminishing returns |
| Threshold-gaming the classifier | Steps 3–4 are continuous, no buckets to dodge |
| Offense-only, ignore defense | Step 2/5 defense ≈ 50% of NetRtg, real proxies |
| Rating explosion → free 82-0 | Step 5 per-player caps + data-fitted scale |

---

## 6. Game design (open to redesigning the game, not just the engine)

- **Keep the slot-machine draft** — it's the proven viral loop. Add **reveal-before-confirm**: see a player's role/fit grade before locking the slot, so choices are informed tradeoffs.
- **Constraints that create decisions:** optional star-point cap, position requirements, small era-diversity nudge (a tiebreaker, NOT an oversized bonus — one pass made it worth more than swapping in an elite player).
- **Modes:**
  - *Daily Draft* — everyone gets the same seeds; global leaderboard. (Wordle-style retention.)
  - *Classic* — free build.
  - *Head-to-Head (async PvP)* — your lineup's rating vs. a friend's → simulated series.
  - *Challenge* — themed constraints (one franchise, under a cap, one decade locked out).
- **Keep "Can you go 82-0?"** as the aspirational hook — now earned through basketball, not stat-stuffing.
- **Cut Dynasty/playoff-bracket mode from v1** (3–5× the complexity; not needed for the core loop).

---

## 7. Build roadmap

- **v0 — MVP (~2–3 wks):** Kaggle data pipeline → player table + per-season league means/SDs/pace. z-score normalization. Offense/defense impact from box (+ advanced where available). Continuous usage penalty. Pythagorean wins. **Calibrate against real team-seasons.** Slot-machine draft + breakdown card. Daily + Classic modes. Next.js (the original's stack) or a clean React+Vite front end.
- **v1:** spacing + role-coverage model, Head-to-Head PvP, anti-exploit hardening, published calibration table.
- **v2:** advanced-data integration for the RAPM/EPM era, playoff/Dynasty mode, shot-location flavor.

---

## 8. Draft pool identity

The draft pool is intentionally **player × franchise × era**, not one global peak per player. A player can have multiple real cards when his career meaningfully spans teams or decades: Cleveland LeBron, Miami LeBron, Lakers LeBron, Orlando Shaq, Lakers Shaq, etc. Each card is backed by the best actual season inside that franchise-era bucket, so Miami LeBron is not 2009 Cleveland LeBron wearing a Heat jersey.

The lineup still enforces one real person. Once any LeBron variant is drafted, all other `person_id=lebron_james` variants are unavailable for the rest of that run. This preserves the team-era slot-machine feel without allowing duplicate-player exploits.

---

## 9. Open decisions for you

1. **Player granularity:** peak *season* (more accurate) vs. the original's *decade averages* (simpler, matches the slot-machine "team+decade" feel). Recommend season, displayed as the decade.
2. **Fidelity vs. ship speed for v0:** full fitted engine now, or a simpler-but-correct v0 (z-scores + usage + equal-base Pythagorean) that we then calibrate up.
3. **Stack:** reuse Next.js (mirror the original) or start clean.
4. **Where the engine runs:** client-side (instant, like the original) vs. a small API (protects the formula, enables real leaderboards/PvP).

---

## 10. Calibration results (what the data actually said)

The engine is fit to **1,170 real NBA team-seasons** (1985–2025) and **24,687 player-seasons**. Honest findings, including the limits:

- **Team mapping:** `ORtg = 104.4 + 0.618·ΣOBPM(top5)`, `DRtg = 107.6 − 0.742·ΣDBPM(top5)`, wins via Pythagorean **k = 14.0** (the fit independently recovered the canonical NBA exponent). R² ≈ 0.42/0.43 per side, wins RMSE ≈ 6. *(§13: k refit to 13.75 against the luck-free pythag-wins target; CV 5.565 / 6.071 vs actual.)* The ceiling is real: a 5-starter feature can't capture bench/coaching/health, and I deliberately don't use bench data the game can't provide.
- **Pre-1974 offense** (z-scores → OBPM, features available pre-1974): **R² = 0.61.** Old-era offense is defensible.
- **Pre-1974 defense** (rebounds + position → DBPM): **R² = 0.04 — near useless.** Box-score defense before steals/blocks is essentially unknowable. Adding **Defensive Win Shares** (which uses team-defense context) lifted it to **R² = 0.23**, which rescues anchors like Russell (now the engine's #1 defender) without inventing reputation. Still flagged as estimated.
- **Usage-overload γ:** tried to fit it from real teams and the slope came back **negative** — real teams never stack five ball-dominant stars, so the data can't justify a penalty in-range. The shipped **γ = 0.22** (`overloadGamma` in `coefficients.json`, hand-set override of the unusable fit) is therefore a **documented fantasy-regime heuristic** (finite ball / usage-curve logic), not a data fit. This is the one knob that is reasoned rather than regressed, by necessity.

**Validation (calibrated engine):** consensus panel ranks sensibly (modern two-way superteam 79 > GOAT-balanced 74 > … > 5-PG chaos 68 > 5-centers 63 > role-players 55 > pure-scorers 53); every degenerate max-stat stack (PPG/REB/AST/USG) lands ≤ the balanced GOAT team; hill-climb optimum is a sane elite roster at 79-3 (82-0 is brutal). *(§13: 80-2 after the budget fix — `scripts/search_best.ts`, person-deduped.)* Top-25-by-impact and top-defender lists track basketball consensus (Russell top-3 defender). Reproduce with `web/scripts/validate.ts` and `rank.ts`.

---

## 11. Accuracy overhaul (v3) — era adjustment, pre-1974 defense, honest out-of-sample error

A second calibration pass tightened **realism and face validity** without disturbing the (already near-optimal) real-team fit. The guiding finding, verified by experiment:

> **The ΣOBPM/ΣDBPM core is at the accuracy ceiling for a 5-starter feature set (~6.0 wins RMSE).** Adding richer fitted team features (turnovers, off/def rebounding, usage concentration) does **not** lower held-out error — they're already inside BPM, and a 5-man feature can't see bench/coaching/health. We confirmed this with a **year-grouped 10-fold cross-validation**: the core scores **6.07** wins RMSE out-of-sample; adding TOV+ORB+DRB to the regression *raised* it to 6.42. *(§13: CV now targets luck-free pythag wins — 5.565, with 6.071 vs actual still reported.)* So those terms were **rejected**, and `coefficients.json._meta.cv_wins_rmse` now reports the honest out-of-sample number.

That splits "accuracy" cleanly into two regimes, and the engine treats them differently:

- **In-distribution (real teams) → FITTED.** ORtg/DRtg from ΣOBPM/ΣDBPM, Pythagorean k, the z→BPM fallbacks, and the **spacing per-shooter coefficient** (now *fit* from ORtg residuals at **0.99**, replacing the hand-set 1.4 — smaller because OBPM already prices in most shooting value).
- **Out-of-distribution (fantasy lineups the data never contains) → REASONED & DOCUMENTED.** Era strength, usage overload, interior-size and perimeter penalties. Each is one-sided/bounded so it is ≈0 for any real team (hence CV-neutral) and only corrects degenerate builds.

What changed:

1. **Era strength.** Per-player impact is scaled by `eraStrength(year)` — `1.0` for **≥1985** (so the modern calibration is untouched), tapering to a `floor` of **0.85** by 1950 (`floor + (1−floor)·t^γ`). It discounts thin/shallow early-league dominance (8 teams, pre-integration, no globalization). Plus a hard **z-cap of ±3.3** at prediction time so a thin early league can't manufacture a super-human z. Together these fix the headline artifact: **George Mikan fell from #4 all-time to outside the top-25**, while Wilt/Russell stay elite. The cap is applied only at prediction; the z→BPM models are **fit on uncapped** modern z (capping the fit distorted coefficients and dropped offModel R² 0.61→0.53).
2. **Pre-1974 defense, redone (`defModelEst`).** The legacy `defModel` carried a *perverse negative* rebounding coefficient (a collinearity artifact that punished rebounders) and let noisy old-era role players rank as all-time defenders. The new path drops `trb` and **Bayesian-shrinks DWS/g toward the league mean** (K=40), capped at the max real DBPM (5.5). Result: **Charlie Black / Frankie Brian / Jim Pollard / Bob Cousy are gone from the top-10 defenders; Bill Russell stays top-3.** Honest cost: R² falls to 0.15 (the legacy 0.23 was inflated by the collinear term) — pre-1974 defense is genuinely uncertain and stays flagged.
3. **Continuous interior presence (replaces the rim-protection cliff).** The best big's *shot-blocking OR size/rebounding* maps smoothly to 0..1, so a rebounding center (Jokić) anchors the paint without elite blocks, while a lineup with **no real big** eats the full penalty (rim + post + glass ≈ 7 pts/100). CV-safe because every real NBA top-5 has a big. This is what brings **five point guards from 73 to 68 wins** without a gameable positional rule.
4. **Rebounding-rate penalty — tested and dropped.** A mean-DRB-z penalty *cannot* separate an all-guard fantasy lineup (meanTrbZ ≈ 0) from a real small-ball contender (also ≈ 0), so it would have hurt real teams. Size is instead carried by the interior-presence term above, which keys on *having a big at all* — something real teams always satisfy.

The one residual quirk: **Nate McMillan** ranks as the top single-season defender (real 1994 DBPM of 5.5, driven by 3.0 steals/game). DBPM structurally over-weights steals; without play-by-play RAPM this isn't fully fixable, and it does not affect team-level prediction (ΣDBPM is well-calibrated), so it is left as a documented, harmless artifact.

---

## 12. Trust model & 82-0 parity (frozen) — read before adding a mode

**Trust model: leaderboards are casual-fair, not adversarially-fair, by design.** The engine is open
source, `players.json` / `coefficients.json` are served publicly, and `/api/evaluate` accepts arbitrary
lineups — so a determined player can always compute optimal plays offline. No server-side secret can
change that. The defenses we DO maintain, and that every new mode must keep:

1. **Server-side replay is the only score that counts.** Every submit route re-runs the full trace
   through `verifyTrace` + the engine; client-sent scores/factors are never read.
2. **No free hints on competitive seeds.** Fit grades / per-candidate deltas are withheld from the
   wire for Daily, HoopIQ, challenges, and any shared-seed mode (`lib/data.ts` spin gating) so
   devtools alone don't reveal the optimal pick. Raising the bar from "open devtools" to "write a
   script" is the entire goal — it filters out ~all casual cheating.
3. **One identity, keep-best, rate-limited.** Anti-grind comes from per-uid keep-best, daily caps,
   and per-IP rate limits — not from trying to hide the math.

Corollary: anonymous identity is a **bearer token** (`crypto.randomUUID()` in localStorage,
`lib/streak.ts`). Unguessable, but anyone who obtains the value IS that player. Accepted: friction-free
anon play is the funnel; signed-in (Google) identity is the upgrade path for anyone who cares about
their standing. Don't ship anon UIDs in URLs or logs.

**82-0 parity: frozen as of the 2026-06 dataset.** Classic's draftable surface (current franchises,
1960s–2020s decades, multi-position eligibility) matches 82-0.com via the committed
`data/820_player_meta.json` (one-time export — see `data/gen_820_meta.mjs`). There is **no ongoing
sync**: if 82-0.com changes its pool, we owe it nothing. All other modes, scoring, and data decisions
are free to diverge. Don't re-run the meta generator or re-litigate parity per feature.

---

## 13. Realism & explanation pass (2026-06) — budget fix, peak smoothing, luck-free CV, win-cost factors

A full audit (5 probe agents + adversarial verification) found the record itself was mostly
defensible — the shock came from one calibration inconsistency plus an explanation vacuum. Engine
changes (supersede the specific numbers in §10–11 where they conflict):

1. **usageBudget 100 → 110.** Five league-average players sum to exactly 100% usage, and real
   top-5-by-MP season-USG sums run hotter (1985–2025, n=1170: p50=107.5, p75=111.8, p90=116.7,
   max=141.5) — so the old budget penalized **91.7% of real teams**, violating §11's own rule that
   OOD heuristics be ≈0 in-distribution (which is also why `gamma_fit` came back negative: the
   regression had absorbed the average cost into the intercept). At 110 the median real team pays
   zero while a five-ball-hog stack (~165% demand) still pays ~12 pts of ORtg. Gamma stays 0.22
   (hand-set; the fit remains unidentifiable from real teams — see §10).
2. **Continuous perimeter credit.** The binary `stl z ≥ 0.6` gate was a ~3-pt cliff between
   z=0.59 and z=0.61, and gameable (coefficients are public). Now each perimeter player adds
   `clamp((stlZ − 0.2)/0.8, 0, 1)` of credit and the penalty scales with the shortfall.
   `playerFeatures` exports the continuous `rimScore`/`perimScore` so harnesses can't drift.
3. **3-yr peak smoothing for elite cards** (`build_dataset.py`). Peak selection is a MAX over
   seasons, which preferentially selects upward noise (within-player OBPM sd ≈ 1.2). Cards with
   peak OBPM > 4 (DBPM > 3.5 for the defense side) and 3+ seasons of 40+ G with that team blend
   0.5 peak / 0.3 prior / 0.2 next, same team only. 2016 Curry 10.3 → 8.95, 2003 McGrady
   9.8 → 8.34, 1994 McMillan DBPM 5.5 → 4.68 (softens §11's documented quirk); sustained peaks
   (2024 Jokić) are untouched. Raw values ship alongside as `raw_obpm`/`raw_dbpm`. Calibration
   inputs keep ACTUAL season values — smoothing is a predict-time estimate of card ability, so
   the fit (and CV) are unchanged. Pool identity (82-0 parity) is byte-identical.
4. **Luck-free CV target** (`calibrate.py`). Actual wins carry ~2.4 wins of close-game luck vs
   the same team's own Pythagorean expectation; the k grid-search and `cv_wins_rmse` now measure
   against pythag-expected wins (k=14 target definition). Result: **k = 13.75**, CV **5.565**
   (vs-actual 6.071 still reported in `_meta.cv_wins_rmse_vs_actual` — matching the old 6.069,
   i.e. the coefficients did not move; this is metric cleaning, not accuracy inflation).
5. **Era adjustment is now a factor.** The eraStrength cost already embedded in off/def is
   isolated and pushed as a quantified "Era adjustment" line when > 0.5 pts (display-only;
   ortg/drtg/wins unchanged by construction).
6. **Per-factor exact win costs.** Every penalty/bonus factor carries `winsEst`: wins as-is minus
   wins with that factor removed, through the real Pythagorean curve for THAT lineup — honest at
   the extremes where a linear 2.7-wins-per-point constant overstates. Star offense/defense are
   level terms (the rating itself), so they get per-player contribution rows instead.

Explanation layer (the shock-reduction half): result-card anchor to a B-R-verified real season
per win band ("comparable to the 66-16 Heat (2012-13)"), ±wins vs the 41-win average, grade
ladder with next-grade nudge, per-player off/def contribution disclosures (the Gobert-drags-
"Star offense" confusion killer), "Top X% today" pill from the daily submit response, the usage
budget bar in every stats-visible mode (usage is intrinsic public player data, not a seed-relative
hint — §12 unaffected; HoopIQ stays blind), anchor-aware share copy + OG footer, and honest
ceiling copy: the engine's theoretical max is **80-2** (`scripts/search_best.ts`, person-deduped
and exact to the engine) — but that five needs two C-only bigs (Jokić + Wilt) and is slot-illegal,
so the ceiling a player can actually reach is the best DRAFTABLE five at **79-3** (Stockton /
McMillan / LeBron '13 / Magic '90 / Jokić '24; the script's slot-legal search section). Product
copy cites the draftable number; the S grade (80+) is engine-theoretical and unreachable on any
leaderboard (it always was — the pre-fix ceiling was also 79). "82-0 achievable" copy was replaced
with the chase framing; golden tests pin both numbers. Factor Hunt's label list and Surgeon's need mapping ("Era adjustment" → modern-era star,
"Thin perimeter defense" → perimeter stopper) were extended to cover the new factors.
