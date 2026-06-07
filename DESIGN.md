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

**Source:** the Kaggle `sumitrodatta/nba-aba-baa-stats` dataset (all players 1947–present, per-game + advanced + per-100 + season pace + league averages), backfilled from Basketball-Reference where needed. Free, complete, season-level.

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
Cross-check: `wins ≈ 41 + 2.7 * NetRtg` (real NBA regression). The curve asymptotes near the extremes, so **82-0 is achievable but brutally hard** — it requires a near-optimal, well-fit, era-spanning roster, which keeps the hook alive while forcing real roster-building. Calibrate so only a near-perfect lineup crosses ~80.

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

- **Team mapping:** `ORtg = 104.4 + 0.618·ΣOBPM(top5)`, `DRtg = 107.6 − 0.742·ΣDBPM(top5)`, wins via Pythagorean **k = 14.0** (the fit independently recovered the canonical NBA exponent). R² ≈ 0.42/0.43 per side, wins RMSE ≈ 6. The ceiling is real: a 5-starter feature can't capture bench/coaching/health, and I deliberately don't use bench data the game can't provide.
- **Pre-1974 offense** (z-scores → OBPM, features available pre-1974): **R² = 0.61.** Old-era offense is defensible.
- **Pre-1974 defense** (rebounds + position → DBPM): **R² = 0.04 — near useless.** Box-score defense before steals/blocks is essentially unknowable. Adding **Defensive Win Shares** (which uses team-defense context) lifted it to **R² = 0.23**, which rescues anchors like Russell (now the engine's #1 defender) without inventing reputation. Still flagged as estimated.
- **Usage-overload γ:** tried to fit it from real teams and the slope came back **negative** — real teams never stack five ball-dominant stars, so the data can't justify a penalty in-range. γ = 0.20 is therefore a **documented fantasy-regime heuristic** (finite ball / usage-curve logic), not a data fit. This is the one knob that is reasoned rather than regressed, by necessity.

**Validation (calibrated engine):** consensus panel ranks sensibly (modern two-way superteam 79 > GOAT-balanced 74 > … > 5-PG chaos 68 > 5-centers 63 > role-players 55 > pure-scorers 53); every degenerate max-stat stack (PPG/REB/AST/USG) lands ≤ the balanced GOAT team; hill-climb optimum is a sane elite roster at 79-3 (82-0 is brutal). Top-25-by-impact and top-defender lists track basketball consensus (Russell top-3 defender). Reproduce with `web/scripts/validate.ts` and `rank.ts`.

---

## 11. Accuracy overhaul (v3) — era adjustment, pre-1974 defense, honest out-of-sample error

A second calibration pass tightened **realism and face validity** without disturbing the (already near-optimal) real-team fit. The guiding finding, verified by experiment:

> **The ΣOBPM/ΣDBPM core is at the accuracy ceiling for a 5-starter feature set (~6.0 wins RMSE).** Adding richer fitted team features (turnovers, off/def rebounding, usage concentration) does **not** lower held-out error — they're already inside BPM, and a 5-man feature can't see bench/coaching/health. We confirmed this with a **year-grouped 10-fold cross-validation**: the core scores **6.07** wins RMSE out-of-sample; adding TOV+ORB+DRB to the regression *raised* it to 6.42. So those terms were **rejected**, and `coefficients.json._meta.cv_wins_rmse` now reports the honest out-of-sample number.

That splits "accuracy" cleanly into two regimes, and the engine treats them differently:

- **In-distribution (real teams) → FITTED.** ORtg/DRtg from ΣOBPM/ΣDBPM, Pythagorean k, the z→BPM fallbacks, and the **spacing per-shooter coefficient** (now *fit* from ORtg residuals at **0.99**, replacing the hand-set 1.4 — smaller because OBPM already prices in most shooting value).
- **Out-of-distribution (fantasy lineups the data never contains) → REASONED & DOCUMENTED.** Era strength, usage overload, interior-size and perimeter penalties. Each is one-sided/bounded so it is ≈0 for any real team (hence CV-neutral) and only corrects degenerate builds.

What changed:

1. **Era strength.** Per-player impact is scaled by `eraStrength(year)` — `1.0` for **≥1985** (so the modern calibration is untouched), tapering to a `floor` of **0.85** by 1950 (`floor + (1−floor)·t^γ`). It discounts thin/shallow early-league dominance (8 teams, pre-integration, no globalization). Plus a hard **z-cap of ±3.3** at prediction time so a thin early league can't manufacture a super-human z. Together these fix the headline artifact: **George Mikan fell from #4 all-time to outside the top-25**, while Wilt/Russell stay elite. The cap is applied only at prediction; the z→BPM models are **fit on uncapped** modern z (capping the fit distorted coefficients and dropped offModel R² 0.61→0.53).
2. **Pre-1974 defense, redone (`defModelEst`).** The legacy `defModel` carried a *perverse negative* rebounding coefficient (a collinearity artifact that punished rebounders) and let noisy old-era role players rank as all-time defenders. The new path drops `trb` and **Bayesian-shrinks DWS/g toward the league mean** (K=40), capped at the max real DBPM (5.5). Result: **Charlie Black / Frankie Brian / Jim Pollard / Bob Cousy are gone from the top-10 defenders; Bill Russell stays top-3.** Honest cost: R² falls to 0.15 (the legacy 0.23 was inflated by the collinear term) — pre-1974 defense is genuinely uncertain and stays flagged.
3. **Continuous interior presence (replaces the rim-protection cliff).** The best big's *shot-blocking OR size/rebounding* maps smoothly to 0..1, so a rebounding center (Jokić) anchors the paint without elite blocks, while a lineup with **no real big** eats the full penalty (rim + post + glass ≈ 7 pts/100). CV-safe because every real NBA top-5 has a big. This is what brings **five point guards from 73 to 68 wins** without a gameable positional rule.
4. **Rebounding-rate penalty — tested and dropped.** A mean-DRB-z penalty *cannot* separate an all-guard fantasy lineup (meanTrbZ ≈ 0) from a real small-ball contender (also ≈ 0), so it would have hurt real teams. Size is instead carried by the interior-presence term above, which keys on *having a big at all* — something real teams always satisfy.

The one residual quirk: **Nate McMillan** ranks as the top single-season defender (real 1994 DBPM of 5.5, driven by 3.0 steals/game). DBPM structurally over-weights steals; without play-by-play RAPM this isn't fully fixable, and it does not affect team-level prediction (ΣDBPM is well-calibrated), so it is left as a documented, harmless artifact.
