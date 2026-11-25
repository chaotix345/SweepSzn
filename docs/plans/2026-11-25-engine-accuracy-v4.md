# Engine Accuracy v4 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order; run each task's verification step before ticking it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card ratings that read as "this player as a 36+ minute starter on a contender", lineup penalties that only fire where real teams have never been, public accuracy receipts, and stored scores moved to the new engine.

**Architecture:** A new offline card-rating model (`data/card_model.py`) shrinks each card toward the player's surrounding seasons and a minutes prior, with a defense blend fitted against RAPM (1997+) when available. `calibrate.py` gains Track B (out-of-season card CV) and writes the team-map scales the engine ships. A new `data/rate_cards.py` writes `off_rating`/`def_rating` into the committed `players.json` by id, never regenerating the pool. The engine prefers those fields, gets a two-sided usage band and a stronger interior term, and `/how-it-works` renders the receipts from the live engine.

**Tech Stack:** Python 3 + pandas/numpy (offline pipeline, new pytest suite), TypeScript engine + Next.js 16 App Router, Vitest, Upstash Redis (ops script).

**Spec:** `docs/specs/2026-11-25-engine-accuracy-v4-design.md` (approved 2026-11-25). Read it first; this plan argues from it.

## Global Constraints

- Card IDs, card seasons, display stat lines, the draftable pool, and 82-0 parity are frozen. The set of ids in `web/public/data/players.json` must be byte-identical before and after.
- Never regenerate `players.json` from the scrape. Only `rate_cards.py` may write it, and only the fields `off_rating`, `def_rating` (new) and nothing else.
- Committed data stays Basketball-Reference-derived. RAPM is downloaded to gitignored `data/raw/rapm/` and used only as a fitting target; never commit RAPM values or a file that contains them.
- The whole pipeline runs end to end with RAPM absent (`--no-rapm` or missing files) and records `_meta.rapm_used: false`.
- Offline only: the app reads committed static JSON; no runtime API calls.
- Every reasoned (out-of-distribution) penalty is < 0.2 pts on ≥ 99% of the real team-seasons in calibration.
- No per-player or per-team overrides anywhere. No coefficient is tuned against one named lineup; penalties are sized against the tuning half of the stress panel only (Task 5).
- Every factor stays one plain-English label with a `winsEst`.
- Track A (existing raw-BPM core CV) must stay ≤ 5.565 vs luck-free pythag wins and ≤ 6.071 vs actual.
- Priority when checks conflict: Track A + leakage guard > spec §4 anti-goals > Track B beats baseline > stress panel and lists. A panel miss means fix the model, not nudge toward the lineup.
- Tests are Vitest (`npm test` in `web/`) plus the new `pytest data/tests`. No standalone `npx tsx` test scripts.
- Ship right after a Daily rollover (Factor Hunt decoys reshuffle when a label is added — `lib/factorHunt.ts:15-17`).

## Review Focus

1. **Pool drift on rebuild.** A re-scrape where B-R has revised an old stat line must not change any card id, season, or display stat. Test: `test_rate_cards_preserves_ids_and_display_stats` (Task 4).
2. **Name collisions across players.** Two different players with the same B-R name (e.g. Gerald Henderson Sr./Jr.) must not pool seasons into one rating. Test: `test_rate_ignores_seasons_outside_card_career_window` (Task 2) — seasons more than 6 years from any season of the card's team-stint are ignored.
3. **Cards with one usable season** (short stints, rookies, pre-1974 with no DWS): rating falls back to the prior-shrunk single season, never NaN/None. Test: `test_rate_single_season_shrinks_toward_prior` (Task 2) and the Vitest "every card has finite off_rating/def_rating" check (Task 4).
4. **RAPM name matching fails silently** (accents, Jr., suffixes): fit must report match rate and refuse to use RAPM below 90% of 1997+ starter seasons matched. Test: `test_rapm_match_rate_gate` (Task 1).
5. **Lineups at exactly the usage bounds** must have zero penalty, and the penalty must be continuous across the bound (no cliff). Test: `usage band is zero at and continuous across both bounds` (Task 6).

---

### Task 1: Rebuild inputs, pool guard, RAPM fetch, pytest scaffold

**Files:**
- Modify: `data/build_dataset.py:320-323` (pool write behind a flag; dump per-team rows)
- Create: `data/fetch_rapm.py`
- Create: `data/tests/test_fetch_rapm.py`, `data/tests/conftest.py`
- Modify: `data/requirements.txt` (add `pytest==8.3.4`)
- Modify: `.github/workflows/ci.yml` (add a `python` job: setup-python 3.12, `pip install -r data/requirements.txt`, `pytest data/tests`)
- Modify: `.gitignore` if `data/raw/` is not already ignored

**Interfaces:**
- Produces: `data/out/team_player_seasons.json` — list of the existing `team_rows` dicts (`name, year, team, pos, tier, age, g, mp, BOX…, usg, obpm, dbpm, bpm, vorp, ows, dws, z`).
- Produces: `data/out/rapm.json` — `{"source": str, "rows": [{"name": str, "year": int, "o": float, "d": float, "poss": int|null}]}` or file absent.
- Produces: `fetch_rapm.normalize_name(name: str) -> str` and `fetch_rapm.match_rate(rapm_rows, seasons, min_mp=1000) -> float`.

- [ ] **Step 1: Record the pre-change baseline.** From `web/`, run `npx tsx scripts/search_best.ts` and `npx tsx scripts/rank.ts` against the current data and paste outputs into `docs/plans/2026-11-25-engine-accuracy-v4-baseline.md`. Write the current card id list (sorted) to `web/test/fixtures/card_ids_v3.json`. Add `web/test/acceptance.v4.test.ts` with only the `randomLineups` spread helper described in Task 7 Step 1 and a test that logs `spreadSD`; record that number in the baseline doc. Commit.
- [ ] **Step 2: Guard the pool.** `build_dataset.py` writes `players.json` and `league_context.json` only when run with `--write-pool`; default run writes everything under `data/out/` plus the new `team_player_seasons.json`.
- [ ] **Step 3: Rebuild intermediates.** `python data/scrape.py` (≈13 min, resumable) then `python data/build_dataset.py`. Verify: `git status --porcelain web/public/data` is empty.
- [ ] **Step 4: Write failing tests** in `data/tests/test_fetch_rapm.py`:
  - `test_normalize_name_strips_accents_and_suffixes`: `normalize_name("Nikola Jokić") == normalize_name("Nikola Jokic")`; `normalize_name("Gary Payton II") != normalize_name("Gary Payton")`; `normalize_name("Jaren Jackson Jr.") == "jaren jackson jr"`.
  - `test_rapm_match_rate_gate`: with 10 synthetic 1997+ seasons ≥1000 min and RAPM rows matching 8, `match_rate(...) == 0.8`.
- [ ] **Step 5: Run** `pytest data/tests -v` → FAIL (module missing).
- [ ] **Step 6: Implement `data/fetch_rapm.py`.** Download nbarapm.com's season-level RAPM (offense/defense split; prefer single-season or 3-year centered, record which in `source`) to `data/raw/rapm/`. If download fails, print where to place a manually downloaded CSV and exit 0 without writing `rapm.json`. Normalize to `data/out/rapm.json`. Print `match_rate`; if < 0.90, do not write `rapm.json` and say why.
- [ ] **Step 7: Run** `pytest data/tests -v` → PASS. Run `python data/fetch_rapm.py`; note match rate in the baseline doc.
- [ ] **Step 8: Commit** (`feat(data): pool write guard, per-team season dump, offline RAPM fetch`).

### Task 2: Card rating model

**Files:**
- Create: `data/card_model.py`
- Test: `data/tests/test_card_model.py`

**Interfaces:**
- Consumes: `team_player_seasons.json` rows; optional `rapm.json`.
- Produces:
  - `@dataclass CardParams: decay: float; prior_k: float; prior_off: tuple[float, float]; prior_def: tuple[float, float]; def_w: dict[str, float]; off_w: dict[str, float]` — priors are `(a, b)` in `a + b * mpg`; `def_w`/`off_w` are linear weights over the season feature names below plus `"intercept"`.
  - `season_inputs(s: dict, p: CardParams, coeff: dict) -> tuple[float, float] | None` — one season's (off, def) impact on the BPM scale. Off features: `obpm`, `mpg`, `usg`. Def features: `dbpm`, `dws48` (DWS per 48 min), `mpg`, position dummies (same mapping as `calibrate.pos_oh`). Pre-1974 seasons (no `dbpm`/`obpm`) use `coeff["offModel"]` with z capped at `coeff["zCap"]` and `coeff["defModelEst"]` with DWS shrinkage, exactly as `web/lib/engine.ts` `offValue`/`defValue` do today, as the `obpm`/`dbpm` substitutes.
  - `rate(seasons: list[dict], card_year: int, p: CardParams, coeff: dict, exclude_year: int | None = None) -> tuple[float, float]` — minutes-weighted mean of `season_inputs` with weight `g * mp * p.decay ** abs(year - card_year)`, plus `p.prior_k` pseudo-minutes at the minutes prior `a + b * card_mpg`. Seasons of the same person across all teams count. Only seasons within the career window (Review Focus 2) count. `exclude_year` drops that season (Track B).
  - `fit_input_weights(seasons, rapm_rows) -> tuple[dict, dict]` — OLS of RAPM o/d on the feature sets above over 1997+ seasons with ≥ 1000 minutes; returns `(off_w, def_w)`.
  - `DEFAULT_PARAMS: CardParams` — identity weights (`off_w={"obpm":1}`, `def_w={"dbpm":1}`), used when RAPM is absent.

- [ ] **Step 1: Write failing tests:**
  - `test_rate_single_season_equals_input_when_prior_k_zero`
  - `test_rate_single_season_shrinks_toward_prior`: one season off=8, mpg=36, `prior_k=500`, prior off `(−2, 0.1)` → result strictly between 1.6 and 8.
  - `test_low_minutes_season_weighs_less`: seasons {36 mpg, dbpm 1} and {24 mpg, dbpm 4} → def < 2.5.
  - `test_exclude_year_drops_that_season`
  - `test_rate_ignores_seasons_outside_card_career_window`: same-name season 15 years away is ignored.
  - `test_pre1974_season_uses_engine_fallback_models`: a 1965 season with no obpm/dbpm gives the same off value as the engine's z-model formula for the same inputs (compute expected inline from `coeff`).
  - `test_fit_input_weights_recovers_known_weights`: synthetic data with d = 0.5·dbpm + 0.04·dws48·100 → weights within 0.05.
- [ ] **Step 2: Run** `pytest data/tests/test_card_model.py -v` → FAIL.
- [ ] **Step 3: Implement** `data/card_model.py` to the interfaces above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (`feat(data): minutes-aware multi-season card rating model`).

### Task 3: Calibration Track B, usage bounds, OOD rates, famous teams

**Files:**
- Modify: `data/calibrate.py` (new sections after the existing CV; existing Track A code unchanged)
- Create: `web/public/data/famous_teams.json`
- Test: `data/tests/test_calibrate_helpers.py`

**Interfaces:**
- Consumes: `card_model.rate`, `fit_input_weights`, `DEFAULT_PARAMS`; `rapm.json` if present.
- Produces in `coefficients.json`:
  - Unchanged keys keep Track A meaning: `_meta.cv_wins_rmse`, `_meta.cv_wins_rmse_vs_actual`.
  - `offScale`, `defScale`, `ortgBase`, `drtgBase` — now fitted on Track B card ratings (spec §6). Keep the Track A values as `_meta.track_a_scales`.
  - `cardModel: {decay, prior_k, prior_off, prior_def, off_w, def_w}`.
  - `usageBudget` = p99 of real top-5 USG sums (rounded to 0.5); `usageFloor` = p1 (rounded to 0.5).
  - `overloadGamma`, `overloadPow`, `shortfallGamma`, `noRimPenalty`, `thinPerimeterPenalty` — reasoned constants, set in Task 6.
  - `_meta.track_b_cv`, `_meta.track_b_cv_vs_actual`, `_meta.track_b_baseline_cv`, `_meta.rapm_used`, `_meta.rapm_match_rate`, `_meta.ood_fire_rate: {overload, shortfall, rim, perim}`, `_meta.usage_p1`, `_meta.usage_p99`, `_meta.engine_version: 4`.
- Produces `famous_teams.json`: `[{"label": "1995-96 Bulls", "year": 1996, "team": "CHI", "predicted_wins": int, "actual_wins": int, "actual_losses": int}]` for 1986 BOS, 1987 LAL, 1996 CHI, 2001 LAL, 2004 DET, 2008 BOS, 2013 MIA, 2014 SAS, 2016 GSW, 2017 GSW. `predicted_wins` uses Track B (out-of-season) ratings through the shipped team map and Pythagorean k.

- [ ] **Step 1: Write failing tests** in `test_calibrate_helpers.py` for helpers you extract into `card_model.py` or a new `data/calib_lib.py`:
  - `test_track_b_rows_exclude_target_season`: the rating used for a (player, 2005) team row equals `rate(..., exclude_year=2005)`.
  - `test_baseline_is_mean_of_adjacent_raw_bpm`: baseline rating = mean of raw obpm/dbpm in year±1 (any team, ≥ 20 games), falling back to league-average 0 when none.
  - `test_ood_fire_rate_counts_penalties_over_threshold`: 3 of 100 synthetic teams with penalty ≥ 0.2 → 0.03.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**:
  - Fit `off_w/def_w` via `fit_input_weights` when RAPM is present; else `DEFAULT_PARAMS` weights.
  - Grid-search `decay ∈ {0.5,0.6,0.7,0.8,0.9}`, `prior_k ∈ {0,250,500,1000,2000}` minimizing Track B CV (year-grouped 10-fold, `rngp` seed 7, same fold construction as `cv_wins`). Prior `(a,b)` fitted by OLS of season off/def inputs on mpg over 1985+ seasons.
  - Track B: per real team-season, top-5 by MP, each rated with `exclude_year` = that season; refit bases/scales per fold; report CV vs pythag and vs actual. Baseline: same pipeline with the adjacent-season raw mean.
  - Assert `track_b_cv < track_b_baseline_cv` and Track A ≤ 5.565 / 6.071; exit non-zero on failure.
  - Diminishing-returns test: add `sumOff**2` and `sumDef**2` columns to Track A CV; record `_meta.concavity_helps_cv` (true only if CV drops ≥ 0.02). Engine adopts it only if true (Task 6 Step 3b).
  - Usage percentiles, OOD fire rates (penalties computed with the same formulas as `lineupTerms`, using the final constants), `famous_teams.json`.
- [ ] **Step 4: Run** `pytest data/tests -v` → PASS; `python data/calibrate.py` exits 0 and prints Track A, Track B, baseline.
- [ ] **Step 5: Commit** (`feat(calibrate): out-of-season card CV, usage bounds, OOD fire rates, famous-team receipts`).

### Task 4: Write card ratings and teach the engine to read them

**Files:**
- Create: `data/rate_cards.py`
- Test: `data/tests/test_rate_cards.py`
- Modify: `web/lib/types.ts:31-67` (Player), `web/lib/types.ts:188-213` (Coefficients)
- Modify: `web/lib/engine.ts:4-27, 64-84` (defaults, offValue, defValue)
- Modify: `web/public/data/players.json`, `web/public/data/coefficients.json` (generated)
- Test: `web/lib/engine.test.ts`, `web/lib/coefficients.schema.test.ts`

**Interfaces:**
- Consumes: `coefficients.json.cardModel`, `card_model.rate`.
- Produces: each card gains `off_rating: number`, `def_rating: number` (BPM scale, before era strength). `Player.off_rating?: number | null`, `Player.def_rating?: number | null`. `Coefficients` gains `usageFloor`, `overloadPow`, `shortfallGamma`, `cardModel` (typed as the object above); defaults mirror `coefficients.json`.
- Engine: `offValue` = `(p.off_rating ?? <current path>) * eraStrength(p.year, c)`; `defValue` likewise with `def_rating`.

- [ ] **Step 1: Write failing tests:**
  - `test_rate_cards_preserves_ids_and_display_stats` (pytest): run on a 3-card fixture; output ids, `year`, `pts`, `obpm`, `dbpm`, `raw_obpm` equal input; only `off_rating`/`def_rating` added.
  - Vitest `engine.test.ts`: "off_rating/def_rating take precedence over obpm/dbpm" and "missing off_rating falls back to the current path".
  - Vitest golden file: "every card has finite off_rating and def_rating" and "card id set is unchanged" (compare against `web/test/fixtures/card_ids_v3.json` from Task 1 Step 1).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `rate_cards.py` (reads committed `players.json`, writes it back with only the two new fields, preserves key order and formatting via the same `dump_json`), the types, and the engine read path.
- [ ] **Step 4: Run** `python data/rate_cards.py`, `pytest data/tests -v`, and from `web/` `npm test -- engine coefficients` → new tests PASS. Golden pins will fail (expected; re-pinned in Task 7).
- [ ] **Step 5: Commit** (`feat(engine): cards rated as multi-season, minutes-aware starters`).

### Task 5: Stress panel, pre-registered

**Files:**
- Create: `web/lib/stressPanel.ts`
- Test: `web/test/stressPanel.test.ts`

**Interfaces:**
- Produces: `export interface PanelLineup { key: string; label: string; ids: string[]; kind: "balanced" | "no-big" | "no-creator" | "ball-hog" | "legends-poor-fit"; half: "tune" | "holdout"; range: [number, number] | null; publicName: string }` and `export const STRESS_PANEL: PanelLineup[]`.

- [ ] **Step 1: Define the panel with exact card ids** (look them up in `players.json`). Tuning half: the four spec lineups with their spec ranges (Washington 45-52, five elite PGs 50-57, five non-scoring defenders 35-42, five ball-hog scorers 58-64) plus the `validate.ts` "GOAT balanced" five (range null; ordering check only). Holdout half: at least two more lineups per gimmick kind and one more legends-poor-fit, each with a range written now from basketball reasoning and a one-line `label` saying why.
- [ ] **Step 2: Commit the panel before any penalty change** (`test(engine): pre-register v4 stress panel`). This commit is the pre-registration; holdout ranges may not change after it.
- [ ] **Step 3: Write tests** (`stressPanel.test.ts`): every id resolves; no person appears twice in a lineup; each lineup is slot-legal. Leave the range assertions for Task 8.
- [ ] **Step 4: Run** `npm test -- stressPanel` → PASS. Commit.

### Task 6: Lineup layer — usage band, creation shortfall, interior

**Files:**
- Modify: `web/lib/engine.ts:167-193` (`lineupTerms`), `:244-257` (factors)
- Modify: `web/scripts/search_best.ts:17` (`wpOf` mirror)
- Modify: `web/lib/factorHunt.ts:18-28`, `web/lib/surgeon.ts:35-47`, `web/components/game/FhDialog.tsx:13-19`, `web/lib/explain.ts` (`factorBlurb`)
- Modify: `data/calibrate.py` (reasoned constants + OOD rates)
- Test: `web/lib/engine.test.ts`, `web/lib/factorHunt.test.ts`, `web/lib/surgeon.test.ts`, `web/lib/explain.test.ts`

**Interfaces:**
- `overloadPenalty = c.overloadGamma * Math.pow(Math.max(0, U - c.usageBudget), c.overloadPow)`
- `shortfallPenalty = c.shortfallGamma * Math.pow(Math.max(0, c.usageFloor - U), c.overloadPow)`; ORtg subtracts both.
- New factor label: `` `Not enough shot creation (${Math.round(U)}% demand)` ``, kind `"bad"`, `winsEst: winsEst(shortfallPenalty, 0)`, emitted when > 0.2. Canonical: `"Not enough shot creation"`. Surgeon need: `"off"` (already titled "shot creator").

- [ ] **Step 1: Write failing tests** (`engine.test.ts`):
  - `usage band is zero at and continuous across both bounds`: U = usageBudget and usageFloor → penalties 0; U = bound ± 0.01 → |penalty| < 0.01.
  - `a five-defender lineup carries a Not enough shot creation factor with negative winsEst`.
  - `no real team-shaped lineup (sum usage 100-140) pays a usage penalty` (synthetic players).
  - Factor Hunt: `FH_FACTOR_LABELS` contains "Not enough shot creation"; Surgeon: `needOf("Not enough shot creation") === "off"`; explain: blurb exists for the new label.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the engine terms, labels, the `wpOf` mirror in `search_best.ts`, and blurbs.
- [ ] **Step 3b (conditional):** only if `_meta.concavity_helps_cv` is true, add `offQuad`/`defQuad` terms (`ortg += offQuad * sumOff²`, `drtg -= defQuad * sumDef²`) fitted in `calibrate.py` Track A, mirrored in `wpOf`. Otherwise skip and note it in DESIGN.md §14.
- [ ] **Step 4: Size the reasoned constants** (`overloadGamma`, `overloadPow`, `shortfallGamma`, `noRimPenalty`, `thinPerimeterPenalty`) against `STRESS_PANEL` entries with `half: "tune"` only. Record the chosen values with a one-line rationale each in `calibrate.py` comments. Re-run `python data/calibrate.py`; it must report every `ood_fire_rate` ≤ 0.01.
- [ ] **Step 5: Run** `npm test -- engine factorHunt surgeon explain blueprint` and `npx tsx scripts/search_best.ts` (drift check line must report no drift) → PASS.
- [ ] **Step 6: Commit** (`feat(engine): two-sided usage band, shot-creation shortfall, interior sizing`).

### Task 7: Acceptance tests and golden re-pin

**Files:**
- Modify: `web/lib/engine.golden.test.ts`
- Modify: `web/components/ResultCard.tsx:35` (`BEST_DRAFTABLE_RECORD`)
- Create: `web/test/acceptance.v4.test.ts`

- [ ] **Step 1: Spread helper** (created in Task 1 Step 1). In `acceptance.v4.test.ts`, `randomLineups(n=2000, seed=7)` draws 5 distinct `person_id`s from cards with `eligible` set (mulberry32 seeded). `spreadSD = stdev(wins)`. The Task 1 baseline value is pinned as `SPREAD_BASELINE`.
- [ ] **Step 2: Write the acceptance tests** (all read committed `players.json`/`coefficients.json` like the golden test, dropping `_meta` before merging):
  - Track A: `_meta.cv_wins_rmse <= 5.565`, `_meta.cv_wins_rmse_vs_actual <= 6.071`.
  - Track B: `_meta.track_b_cv < _meta.track_b_baseline_cv`.
  - OOD: every value of `_meta.ood_fire_rate <= 0.01`.
  - Stress panel (ranges from Task 5): every lineup with a `range` lands inside it (tune and holdout both); GOAT balanced wins > max wins of every gimmick lineup.
  - Top 25 overall (best card per person, `off + def` via `playerImpact`) contains Hakeem Olajuwon, Tim Duncan, Kobe Bryant, Bill Russell, Shaquille O'Neal, Kareem Abdul-Jabbar, and Kevin Love is not ranked above any of them.
  - Top 10 defenders contain Hakeem Olajuwon, Tim Duncan, Bill Russell, and at least two of Ben Wallace / Dikembe Mutombo / Rudy Gobert / David Robinson; every top-10 card has `mp >= 28`.
  - Legends guard: Russell, Wilt, Shaq, Curry, Hakeem, Duncan, Jordan, LeBron, Kareem, Magic, Bird are all in the top 40.
  - Best draftable five (from `search_best.ts` output, pinned by ids): 77-80 wins, no Nate McMillan 1994 card, every member in the top 60 overall.
  - Era seam: per year Y, `m(Y)` = mean `off + def` of the 10 best cards with that year. `|m(1998) − m(1996)|` and `|m(1975) − m(1973)|` ≤ the 90th percentile of `|m(y+2) − m(y)|` over 1976-2023 excluding those two pairs.
  - Spread: `spreadSD >= SPREAD_BASELINE`.
- [ ] **Step 3: Run** `npm test -- acceptance.v4`. On failure, follow the priority order in Global Constraints: fix the model (Tasks 2-3, 6), never the ranges or the holdout panel.
- [ ] **Step 4: Re-pin goldens.** Update the ten golden lineups, the 80-2/79-3 describes, `BEST_DRAFTABLE_RECORD`, and the coefficient sync check to the new committed values. Keep their invariant assertions (grades, factor presence) and adjust only where the spec changes behavior (e.g. `allPG` now expects an interior factor as the largest negative).
- [ ] **Step 5: Run** full `npm test` → PASS. **Commit** (`test(engine): v4 acceptance gates and golden re-pin`).

### Task 8: Public receipts and honest copy

**Files:**
- Modify: `web/app/(site)/how-it-works/page.tsx` (new section after "Calibrated, not guessed"; Stat row values from `_meta`; Principle list adds "Shot creation")
- Modify: `web/components/ResultPreview.tsx` (compute from `evaluateLineup` instead of hard-coded numbers)
- Modify: `web/app/(site)/about/page.tsx:22`, `web/components/LandingSection.tsx:112`
- Modify: `web/components/ResultCard.tsx` (quiet link)
- Modify: `web/lib/marketingMeta.ts:53` if it repeats the claim
- Test: `web/test/components/HowItWorks.test.tsx`, existing `ResultCard.test.tsx`, `LandingSection.test.tsx`

**Interfaces:**
- Consumes: `getCoefficients()` and players from `lib/data.ts`, `STRESS_PANEL`, `famous_teams.json`, `playerImpact`, `evaluateLineup`.

- [ ] **Step 1: Write failing tests:**
  - `HowItWorks.test.tsx`: renders Track A and Track B numbers equal to `_meta` values (formatted to 1 decimal); renders every `STRESS_PANEL` lineup's `publicName` with its engine record; renders 10 famous teams with predicted and actual wins; renders a top-10 players list and top-10 defenders list; does not render the ids of the best draftable five as a group; contains the words "fitted" and "reasoned"; does not contain "not hand-tuned".
  - `ResultCard.test.tsx`: a link to `/how-it-works#receipts` exists.
  - `LandingSection.test.tsx` and an about-page assertion: no "not hand-tuned".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Read `web/DESIGN.md` first (Arena design system) and `node_modules/next/dist/docs/` for any App Router API used. Copy for the fitted-vs-reasoned split: fitted = team map, Pythagorean exponent, spacing, card-rating weights; reasoned = era strength, usage band, shot-creation shortfall, interior and perimeter penalties. Wording goes through the `unslop` skill.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run build` → PASS. **Commit** (`feat(site): public accuracy receipts; honest fitted-vs-reasoned copy`).

### Task 9: Rescore stored scores

**Files:**
- Create: `web/scripts/rescore_v4.ts` (env-gated, pattern of `scripts/backfill.ts`)
- Create: `web/lib/rescore.ts` (pure functions the script and tests share)
- Test: `web/test/rescore.test.ts` (uses `test/redisFake.ts`)
- Modify: `web/scripts/README.md`

**Interfaces:**
- `rescoreProfileResults(redis, uid: string, evaluate: (ids: string[]) => LineupResult): Promise<number>` — rewrites `wins/losses/grade` of each entry in `results:{uid}` (decode with `fieldedIds`; Surgeon entries via `decodeSurgeonCard`); returns entries changed.
- `rescoreChallenge(redis, id: string, evaluate): Promise<boolean>` — recomputes `chal:{id}:info` creator `wins/losses/net/grade` from its stored `lineup`, and every row in `chal:{id}:meta` from its stored lineup, rewriting `chal:{id}` ZSET scores with `encScore`.
- `archiveAggBoards(redis, version: 3)` — renames `lb:alltime`, `lb:alltime:meta`, and the current `lb:week:{W}`(+`:meta`) to `…:v3`, so new boards start empty.
- Past daily, Factor Hunt, Blueprint and Surgeon daily boards are left as they are: closed competitions that expire within 31 days (my call, spec §9.3).

- [ ] **Step 1: Write failing tests** against `redisFake`: profile entry changes from old to new record; challenge creator and challenger rows rescored and ZSET order follows new scores; `archiveAggBoards` leaves `lb:alltime` empty and `lb:alltime:v3` holding the old data; running everything twice is a no-op the second time.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** library + script. The script prints `skipped: …` and exits 0 without Redis env vars, supports `DRY_RUN=1` (counts only), scans with `SCAN` (never `KEYS`).
- [ ] **Step 4: Run** `npm test -- rescore` → PASS. **Commit** (`feat(ops): v4 rescore and aggregate-board archive script`).
- [ ] **Step 5 (at deploy, with Charlie):** after the Daily rollover following merge, run `DRY_RUN=1` then the real run against production Redis. Record counts in `notes/review.md`.

### Task 10: Docs and full verification

**Files:**
- Modify: `DESIGN.md` (new §14: what changed, Track A/B numbers, RAPM use and fallback, what is fitted vs reasoned, panel pre-registration, rescore policy)
- Modify: `README.md` (records, CV numbers, 79-3/80-2 mentions, pipeline order: `scrape → build_dataset → fetch_rapm → calibrate → rate_cards`)
- Modify: `web/scripts/README.md`

- [ ] **Step 1: Update docs.** Run the `unslop` skill over the new prose.
- [ ] **Step 2: Full verification** from `web/`: `npx tsc --noEmit`, `npx eslint app components lib test scripts`, `npm test`, `npm run build`; from repo root: `pytest data/tests`. All PASS. Run `npx tsx scripts/validate.ts` and `scripts/rank.ts`; paste outputs into the baseline doc under "after".
- [ ] **Step 3: Commit** (`docs: engine accuracy v4`).
