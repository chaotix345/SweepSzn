# SweepSzn In-Game Feature Suite — Design Spec

**Date:** 2026-06-18
**Status:** Approved for build (all six features, "most complete" order, no shortcuts)
**Branch:** `feat/ingame-features-suite`

## Goal

Add data-analysis and player-info features to the **in-game** experience (during draft + post-game) —
not new game modes. Surface the rich player/team data we already compute but never show, while
**preserving the challenge**: the game must never become a solver.

## The integrity rule (non-negotiable, governs every feature)

Classify every surface by **what it reveals** and **when**:

- **Descriptive** (who/what a player is: real box + advanced stats *as description*, accolades, career
  arc, age/minutes/games, league/era context) → **safe anytime**. Real-world greatness ≠ this engine's
  reward, so it enriches without solving.
- **Prescriptive / engine-internal** (per-candidate marginal wins, `offValue`/`defValue`, fit deltas as a
  number, "best pick" stars, projected-wins-if-I-take-him) → the **answer key**. Either **gated** behind
  the existing bounded 2-hint economy, or **deferred to post-commit** (after all 5 locked & scored).
- A few **real** stats are near-monotonic with the engine's reward (usage% it punishes; 3PA×accuracy =
  spacing): show as flavor/description, never as a tuned "optimize-me" gauge.

**Timing is the lever:** pre-commit *withhold* the engine's verdict; post-commit *open it fully.*
The "earned-gated" middle tier stays deliberately minimal — today's 2-hint system is the only mechanic there.

## Features (most-complete order is the build order)

### 1. Era & League Context Layer — Tier A — Effort M
Make `web/public/data/league_context.json` a runtime source for the first time.
- **Era Pulse banner** atop the draft board per spin: `1962 NBA · 97.4 pace · 19.6 PPG avg · Pre-3pt era`.
- **Stat-context bars** in the expanded row / dossier: `PTS 50.4 ▓▓▓ +4.1σ` (uses existing `z.*`).
- **Asterisk explainer** popover for the era-adjust `*` (closes existing UX debt).
- **ResultCard era footnotes** per roster row (post-commit).
- **Surfaces:** `web/components/game/Browser.tsx`, `web/components/ResultCard.tsx`, extend `/api/spin` payload.
- **Data:** `league_context.json` (pace, lg_ortg, per-stat avg+SD); `z.*` from `players.json` drive bar widths.
- **Build:** read `league_context.json` in `/api/spin`, attach a `league_context` snapshot keyed by year; derive a
  `three_pt_era` label. No new data pipeline.
- **Recommended:** ship banner + bars + asterisk together (the "Full Layer" variation).
- **Integrity:** all descriptive. Guardrail: bar labels show only `+Xσ vs YYYY avg`, never a synthetic
  "era-adjusted PPG" number.

### 2. Player & Lineup Compare — Tier A (pre-pick) / post-commit — Effort M→L
- **Pre-pick:** select two candidates → side-by-side real-stat table + a **z-score pentagon radar**
  (Scoring/Reb/Playmaking/Defense/Efficiency). Higher value tinted blue (no green/red "better pick").
- **Post-game:** compare your five vs a real team (`team_seasons.json`) or a friend's result.
- **Surfaces:** `Browser.tsx` (Compare toggle + bottom-sheet/drawer), `ResultCard.tsx` (Compare modal),
  new SSR route `/compare/[id1]/[id2]`.
- **Shared primitive:** `web/components/ui/ZRadar.tsx` (~80 lines SVG, no library) — reused by Dossier & Dex.
- **Data:** `players.json` box+advanced+`z.*`; `team_seasons.json` via a new offline `emit_team_lookup` →
  `public/data/team_lookup.json`; `GET /api/result/[id]` extracted from the `/r/[id]` SSR path for friend compare.
- **Recommended:** bottom-sheet (mobile) / right drawer (desktop).
- **Integrity:** descriptive. Guardrails: `usg` monochrome (no target-zone coloring); confirm `vorp` in
  `players.json` is B-Ref VORP and not the engine-internal `peak_score` before showing it (drop if engine-internal);
  no "who's the better pick" summary line.

### 3. Player Dossier — Tier A — Effort M
Tap any player → identity card. **Layout: inline expander (A) on mobile, side drawer (B) on desktop**, one
responsive component (decided).
- **Blocks:** identity; accolades line; career arc + franchise/era timeline; era-context bars (from Feature 1);
  z-score radar (from Feature 2); context line (age/games/minutes/TS%/defense-estimated).
- **Surfaces:** `Browser.tsx` candidate rows + `ResultCard.tsx` roster rows.
- **Data:** `players.json`, `league_context.json`, `820_player_meta` (career journey), and the **one real build
  step**: extend `data/build_fame.py` (or a sibling) to emit per-`person_id` accolade components
  (All-Star count, All-NBA by team, All-Defense, MVP finishes, HOF) from the cached B-Ref HTML → `accolades.json`.
- **Integrity:** all descriptive; keep usage as flavor.

### 4. Drafted Dex & Milestones — Tier A (collection) / post-commit (badges) — Effort L
- **Collection** of every player-season you've fielded, filter by decade/team/position, completion counter.
- **Milestones**: data-grounded badges (Scorer `pts≥30`, Glass Ceiling `trb≥15`, Era Tourist 5 decades, etc.);
  locked badges show *category name only*, never the unlock formula.
- **Surfaces:** new `/dex` route (`app/(site)/dex/page.tsx`), `ResultCard.tsx` post-reveal toast + count strip,
  entry point near `ResultsHistory`.
- **Data:** `players.json` (descriptive only); `lib/dex.ts` static badge defs + pure `computeBadges`; `GET /api/dex`
  derived from existing `results:{uid}` (MVP) → dedicated `dex:{uid}` Redis SET (deluxe, unbounded).
- **Deps:** account sync (PR #43, live), `decodeShare()`, `playerTraits()`.
- **Integrity:** descriptive. Cut: peak_score/vorp/obpm anywhere; "players you're missing" nudges; team-completion
  sorted by avg engine value.

### 5. Post-Game What-If Lab — Tier C (post-commit) — Effort M
Unifies three sub-features below the ResultCard:
- **Swap sandbox:** replace any slot from that team/era pool, re-run engine live, see W-L + grade + factor delta.
- **Weakest-slot deep dive:** top-3 better picks for the flagged slot (engine already scored the pool).
- **Scouting anchor:** your est. ORtg/DRtg/NetRtg next to the matched real team's actuals (`team_seasons.json`).
- **Surfaces:** `ResultCard.tsx` (`<WhatIfLab>` below weakest-slot pointer), new `web/components/game/WhatIfLab.tsx`,
  `ScoutingAnchor.tsx`, `WeakestSlotDive.tsx`.
- **Data:** `POST /api/what-if` (thin alias of `/api/evaluate`); `players.json` client filter for candidates;
  `team_lookup.json` (from Feature 2); optional offline `build_top3_alts.py` → `top3_alts.json`.
- **Recommended:** inline accordion in the ResultCard.
- **Integrity:** full engine transparency is FAIR here (round scored). Guardrails: `/api/what-if` must validate
  the session is already completed/scored (reject in-progress drafts) + rate-limit; swap list sorted by **fame
  only**, never by simulated result; share-from-lab cards labeled "What-If".

### 6. Social Texture: Rarity + Crowd Signal — Tier C — Effort M
- **Crowd signal:** after a slot **locks** (never before), `65% chose Isaiah Thomas here` — flat neutral text.
- **Rarity badge:** on result + share image: `Only 2.8% built this exact core`; milestone flag `First 72+ win
  build for the 90s Bulls`.
- **Surfaces:** `Browser.tsx` (post-lock line), `ResultCard.tsx` (`RarityBadge`), OG image, `/r/[id]`.
- **Data:** new Redis keys via `POST /api/slot-pick` + core-pick INCR at `/api/evaluate`; `GET /api/crowd`,
  `GET /api/rarity`.
- **Phasing:** ship **logging first** (silent, Step 2 in build order) so volume accumulates before the X launch;
  surface the UI later (crowd ≥20/spin, rarity ≥100/core; suppress below).
- **Integrity:** post-commit/post-lock. Cut: pre-lock crowd reveal, grade-stratified crowd data, "best pick chosen
  by X% of A+ teams". Rarity copy must never imply rare = good. Majority name not bolded/colored.

## Build order (dependency-driven)

1. **Era & League Context Layer** — zero deps; builds the era-context reader + stat-bar primitive.
2. **Social — logging only** (silent Redis INCRs); accumulate volume now.
3. **Player & Lineup Compare** (pre-pick + `<ZRadar>`) — builds the shared radar primitive.
4. **Player Dossier** — reuses era bars + radar; needs the accolade rebuild.
5. **Drafted Dex MVP** — account sync live; reuses era chips + traits.
6. **Post-Game What-If Lab** — reuses team_lookup + radar + `/api/evaluate`.
7. **Social UI** (crowd reveal + rarity) — volume now exists; shares ResultCard zone with the Lab.
8. **Dex Layer 3 + deluxe** — dedicated Redis SET, notifications, "Share your Dex" OG.

## Shared primitives (build once, reuse)

- **Era-context reader** (Feature 1) → Dossier, Compare, Dex.
- **`<ZRadar>`** (Feature 2) → Dossier, Dex.
- **`team_lookup.json`** (Feature 2) → Compare "vs real team" + Lab scouting anchor.
- **Redis pick-logging** (Feature 6 Step) → crowd + rarity.
- **ResultCard extension zones** are non-overlapping across Features 1/4/5/6 — sequence to avoid conflicts.

## Cross-feature integrity guardrails (enforce in code)

1. `/api/what-if` validates a completed/scored session; rate-limited.
2. Lab swap list sorts by fame only — enforce server-side (no "sort by result").
3. Confirm `players.json.vorp` is B-Ref VORP, not engine `peak_score`, before surfacing in Compare.
4. Crowd reveal hooks the **post-confirm** callback, not selection/hover; volume-gated.
5. No engine-internal field (`peak_score`/`obpm`/`dbpm`/`vorp` if internal) shown anywhere pre-commit.

## Cut (would break the challenge)

Per-candidate marginal-wins; "maximize wins" auto-fill; swap list sorted by simulated result; pre-lock crowd
reveal; grade-stratified crowd data; "best pick chosen by X% of top teams"; synthetic "era-adjusted PPG";
"players you're missing — draft these next"; global rarity framed as quality.

## Testing & process

- TDD per feature (Vitest suite is live; ~1329 tests green on main at 9492ed8).
- Each feature: tests first, implement, keep suite green, commit on the branch.
- No push/PR until requested. Canary/QA after merge per existing workflow.
