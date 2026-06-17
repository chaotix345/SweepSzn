# SweepSzn Rank — a fame-anchored default sort

**Date:** 2026-06-17
**Status:** Approved for planning
**Branch:** `feat/sweepszn-rank-sort`

## Problem

On every sortable game mode the draft board can be sorted by PPG, RPG, APG, or A–Z, and the
default is **A–Z**. A–Z was a deliberate choice (browser.tsx:43-45): a PPG default "steered
players toward the high-scorer trap the engine punishes," so the neutral alphabetical default
was installed and locked with a regression test (rule **R8**, browser.test.tsx:20-31).

A–Z is neutral but not *intuitive*. When a user spins, say, the 1990s Bulls, they expect to
see Jordan, Pippen, Rodman near the top — the names they associate with that team-era — not
players sorted by surname. We want a **"SweepSzn Rank"** sort that surfaces the players a user
would expect to see for that team-era, and make it the **default**.

Requirements / constraints:
- It is **not** the "fit" sort (the engine's roster-aware hint). Fame is fixed per player and
  independent of the user's current roster; fit is roster-relative and hint-gated.
- It should be the new default everywhere the sort control appears.
- "Most complete" was chosen over "minimal" — rank by genuine recognizability, not just a stat.
- Ship as **one unit** (data + ranking + sort + default + tests), not phased.

## Background (verified)

- **All sorting is client-side** in `web/components/game/browser.tsx`. `SortKey =
  "fit" | "ppg" | "rpg" | "apg" | "az"` (browser.tsx:8); comparators inline (browser.tsx:56-59);
  native `<select>` (browser.tsx:98-104); default initializer (browser.tsx:45).
- **The server already sorts each pool by `peak_score` desc** before sending it
  (data.ts:203-205 for normal spins; `buildPrimePools` for Prime) — the client then re-sorts and
  discards that order. So an ordering hook already exists server-side.
- **No fame/accolade data exists.** All 40 player fields are box/advanced stats; the only
  "notable player" signal is `peak_score` (a minutes-weighted VORP value). `tier` is data
  completeness (complete/partial/primitive), not prestige.
- **Accolade data is obtainable** from the same source the pipeline already scrapes
  (Basketball-Reference), verified live with the scraper's UA + the pipeline's comment-unwrap:
  - `awards/awards_{year}.html` → tables identified by stable HTML `id`:
    `mvp` (modern) / `nba_mvp` (older; **ignore `aba_*`**), `leading_all_nba`,
    `leading_all_defense` — each carries a vote `Share` column.
  - `allstar/NBA_{year}.html` → one roster table per side; table ids vary by era
    (`Giannis`/`LeBron` in 2023, East/West earlier), so take **all tables except `line_score`**
    and read player names from the first column.
  - Coverage (All-Star 1951+, MVP 1956+, All-NBA/All-Def from inception) fully covers the
    draftable universe, whose pools are locked to decades **1960s–2020s** (data.ts:13). No era gap.

## The ranking algorithm

A per-player **fame score**, aggregated per `person_id` across that person's whole career
(a star is a star regardless of which franchise-era season-row appears in a pool):

```
fame = wAS  * all_star_count
     + wMVP * mvp_share_career
     + wNBA * all_nba_share_career
     + wDEF * all_def_share_career
```

- `all_star_count` — number of All-Star selections.
- `*_share_career` — sum over seasons of the player's vote `Share` (0..1) in that award table.
  Using continuous vote share (not derived 1st/2nd/3rd-team membership) is robust and avoids
  tie/format parsing across 70 seasons.
- Starting weights (tunable): `wAS=1.0, wMVP=3.0, wNBA=2.0, wDEF=1.0`. MVP/All-NBA outrank a
  lone All-Star nod; All-Defensive gives defenders real standing (keeps the sort archetype-diverse).

**Pool ordering = `fame` desc, then `peak_score` desc.** Accoladed players float to the top by
fame; the long tail of un-accoladed role players orders by VORP-value. This is "the names you
know first, then everyone else by quality."

Why this is *not* the high-scorer trap (R8 reconciliation): the trap is that PPG-ordering pushes
players to draft empty-volume scorers the engine punishes. Fame is archetype-diverse by
construction — All-Defensive/All-NBA fame floats Rodman, Mutombo, Draymond, not just scorers — so
the default no longer biases toward high PPG. It's a recognizability order, not a stat order.

## Data pipeline changes

### `data/scrape.py`
Add two URLs to the per-year `targets` list (the existing `fetch()` caches and tolerates HTTP
errors, so lockout years / missing pages skip gracefully):
- `https://www.basketball-reference.com/awards/awards_{y}.html` → `{RAW}/awards_{y}.html`
- `https://www.basketball-reference.com/allstar/NBA_{y}.html` → `{RAW}/allstar_{y}.html`

### `data/build_dataset.py`
1. Loaders that select tables by id on the comment-unwrapped HTML, using
   `pd.read_html(cleaned, attrs={"id": ...})`:
   - `load_award_share(year, table_id)` → DataFrame with `Player` + `Share`. MVP: try id `mvp`,
     fall back to `nba_mvp`. All-NBA: `leading_all_nba`. All-Def: `leading_all_defense`.
     If a season's table lacks a `Share` column (some older years), fall back to a flat
     per-selection weight (e.g. 0.5) so the selection still counts.
   - `load_allstars(year)` → set of player names from every table except `line_score`
     (drop sub-header / "Reserves" / coach / "Did Not Play" rows: keep rows whose first cell
     looks like a player name).
2. A fame-aggregation pass keyed by `slug(name)` (same slug used for `person_id`), building a
   `fame_by_person: dict[str, dict]` with `all_star`, `mvp_share`, `all_nba_share`,
   `all_def_share`, and the derived `fame`.
3. In the peak-selection loop, attach to each pool record:
   `best["fame"] = round(fame, 4)` (default 0.0 when the person has no accolades).
   (Raw counts MAY also be attached for transparency/future badges, but are not required by the
   sort; keep the record lean — `fame` is the only field the runtime needs.)
4. The final dump's sort order is irrelevant — the runtime re-buckets every player by
   `draftIndex` (data.ts) and re-sorts per spin, so file order has no runtime effect.

### `data/enrich_players.mjs`
No logic change — but verify it **preserves** the new `fame` field when it rewrites
players.json (it spreads existing record fields; confirm `fame` survives the round-trip).

### Validation (part of the build, eyeballed)
Print top-20 by global `fame` (expect Kareem/Jordan/LeBron/Russell-tier at the top) and 2-3
sample team-era pools in composite order (e.g. `CHI|1990s`, `LAL|1980s`, `GSW|2010s`) to confirm
the franchise icons lead. Weights are tuned against this sanity check, not guessed blindly.

## Runtime changes

### `web/lib/types.ts`
- `Player`: add `fame?: number;`
- `DraftCandidate`: add `rank?: number;` — the server-assigned ordinal (0 = top of this spin's
  composite order). The client sorts "szn" by this, so the **server is the single source of truth**
  for the ranking and the client needs no fame math.

### `web/lib/data.ts`
- Replace the pool sort in `selectSpin` (data.ts:203-205) with the composite comparator:
  `(b.fame ?? 0) - (a.fame ?? 0) || (b.peak_score ?? 0) - (a.peak_score ?? 0)`.
- Stamp the ordinal when mapping candidates: in `spin()` (data.ts:231) and `primeSpin()`
  (data.ts:284) use `pool.map((p, i) => toCandidate(p, fits?.get(p.id), usage, i))`, and add a
  `rank` param to `toCandidate` (data.ts:91) that sets `rank` on the candidate.
- `getDraftablePool` (data.ts:83-88, the projection ticker's ceiling) stays on `peak_score` — the
  ceiling is about best achievable lineup value, not fame; do not change it.

### `web/lib/prime.ts`
- Update `buildPrimePools`' per-pool sort to the same composite comparator so Prime pools arrive
  in fame-first order (the prime pool is one peak variant per person, so fame attaches cleanly).

### `web/components/game/browser.tsx`
- `SortKey` (browser.tsx:8) → add `"szn"`: `"szn" | "fit" | "ppg" | "rpg" | "apg" | "az"`.
- Comparator map (browser.tsx:57) → add `szn: (c) => c.rank ?? Number.MAX_SAFE_INTEGER`
  (ascending by rank; missing rank sinks to the bottom). The `out.sort` line already treats
  non-`az` keys as ascending-by-number, so `szn` slots in directly.
- Default (browser.tsx:45): `useState<SortKey>(showFit ? "fit" : "szn")` — szn replaces az as the
  pre-hint default. The `effSort` fallback (browser.tsx:47) becomes `"szn"` instead of `"az"`.
- Dropdown (browser.tsx:101-102): add `<option value="szn">Top</option>` as the first
  (non-fit) option. Keep A–Z/PPG/RPG/APG. Label: **"Top"**.
- This applies to all 7 sortable modes automatically (hoopiq still hides the whole control).
  In classic/prime/blueprint, spending a hint still flips the default to fit, unchanged.

## Testing

- **Rewrite R8** (browser.test.tsx:20-31): the default is no longer A–Z. Assert the default sort
  orders candidates by their server `rank` (top-ranked first), and explicitly assert it is **not**
  PPG-first (preserve the original intent of the rule). Provide fixture candidates with `rank` set.
- **New browser tests**: selecting "Top" orders by `rank`; A–Z/PPG/RPG/APG still work; in a
  hint mode, revealing a hint still switches the active sort to fit.
- **Pipeline tests** (Python, run in the data build; or a lightweight assertion in the build
  script's validation block): fame aggregation sums vote share correctly across multiple seasons;
  an un-accoladed player gets `fame == 0`; ABA tables are excluded from MVP.
- **Server test**: `spin()` / `primeSpin()` return candidates whose `rank` is `0..n-1` in
  composite order (fame desc, peak_score desc); a known fixture pool comes back icon-first.
- Full `npm test` (Vitest) green before PR.

## Out of scope (explicit)

- **Championships / rings** as a fame input — per-player ring attribution needs a champion×roster
  cross-ref that's messy for marginal ordering gain. Revisit later if desired.
- **Fame badges on the card** (e.g. "5× All-Star") — a natural complement, but additive UI; the
  raw counts can be carried later without re-touching the sort. Not in this change.
- `getDraftablePool` / projection ceiling — stays `peak_score`-based.

## Risks & mitigations

- **Name→person_id matching**: awards/all-star names are slugged with the same `slug()` the
  pipeline already uses for `person_id`; Basketball-Reference is internally consistent, so matches
  are reliable. Unmatched accolades simply drop (player keeps `fame` from what did match).
  Same-name collisions merge fame across people — a pre-existing `person_id` limitation, rare,
  acceptable.
- **Scrape politeness/availability**: reuses the existing throttled (3.6s) UA fetch; ~150 extra
  cached pages (~10 min) one-time. Missing pages (lockout all-star years) skip via the existing
  HTTP-error handling.
- **R8 product rule change**: this intentionally revisits the locked A–Z default. The new default
  is fame-based (archetype-diverse), not stat-based, so it does not reintroduce the PPG trap R8
  guarded against; the rewritten test documents the new intent.
