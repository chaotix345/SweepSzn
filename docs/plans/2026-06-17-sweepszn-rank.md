# SweepSzn Rank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fame-anchored "Top" sort to the draft board, make it the default, ranked by real accolades (All-Star / MVP / All-NBA / All-Defensive) with `peak_score` as the tiebreak.

**Architecture:** The server owns the ranking — each `(team, decade)` pool is sorted by a pure `compareSzn` comparator (`fame` desc → `peak_score` desc) and each candidate is stamped with a `rank` ordinal; the client just sorts the `"szn"` option by `rank`. Player `fame` is added to `players.json` by a new in-place Python enricher (`data/build_fame.py`) that parses awards/all-star pages cached by the existing scraper. Runtime is built and tested first against fixtures (works with `fame` absent → falls back to `peak_score` order), then the data pipeline supplies real `fame`.

**Tech Stack:** Next.js/React/TypeScript (runtime), Vitest + Testing Library (tests), Python/pandas (data pipeline), Basketball-Reference (data source).

**Deviation from spec (intentional):** fame is computed by a dedicated in-place enricher (`build_fame.py`) run last, not folded into `build_dataset.py`. This keeps the `players.json` diff to *only* the added `fame` field and avoids a full rebuild. Net behavior is identical to the spec.

**Pipeline run order (canonical):** `scrape.py` → `build_dataset.py` → `enrich_players.mjs` → **`build_fame.py` (last)**. For THIS change we only run `scrape.py` (to fetch the new pages) + `build_fame.py` (to add `fame`); `players.json` is enriched in place, not regenerated.

---

## File Structure

**Runtime (Phase A — TDD with Vitest, data-independent):**
- Modify `web/lib/types.ts` — add `fame?: number` to `Player`; add `rank?: number` to `DraftCandidate`.
- Modify `web/lib/prime.ts` — add exported pure `compareSzn`; use it in `buildPrimePools`.
- Modify `web/lib/data.ts` — sort pools by `compareSzn`; stamp `rank` on candidates.
- Modify `web/components/game/browser.tsx` — add `"szn"` sort, make it the default, add the "Top" option.
- Create `web/test/rank.test.ts` — unit tests for `compareSzn`.
- Modify `web/test/routes/spin.test.ts` — assert candidates carry a sequential `rank`.
- Modify `web/test/components/browser.test.tsx` — rewrite R8; add sort-option tests.

**Data pipeline (Phase B — verification-driven; no Python test harness in this repo):**
- Modify `data/scrape.py` — fetch awards + all-star pages.
- Create `data/build_fame.py` — in-place `fame` enricher.
- Modify `web/public/data/players.json` — regenerated field `fame` (output, committed).

---

## Phase A — Runtime

### Task 1: `compareSzn` comparator + `Player.fame`

**Files:**
- Modify: `web/lib/types.ts:53` (add field to `Player`)
- Modify: `web/lib/prime.ts:6` (import), `web/lib/prime.ts:57` (use), and add the export
- Test: `web/test/rank.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `web/test/rank.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compareSzn } from "@/lib/prime";

const P = (fame: number | undefined, peak_score: number | undefined) => ({ fame, peak_score });

describe("compareSzn — fame-first board ranking", () => {
  it("orders by fame descending", () => {
    const arr = [P(1, 100), P(5, 0), P(3, 50)];
    arr.sort(compareSzn);
    expect(arr.map((x) => x.fame)).toEqual([5, 3, 1]);
  });

  it("breaks ties by peak_score descending", () => {
    const arr = [P(2, 10), P(2, 99), P(2, 50)];
    arr.sort(compareSzn);
    expect(arr.map((x) => x.peak_score)).toEqual([99, 50, 10]);
  });

  it("treats missing fame/peak_score as 0 (un-accoladed sink below any fame)", () => {
    const arr = [P(undefined, undefined), P(0.1, 0), P(undefined, 5)];
    arr.sort(compareSzn);
    expect(arr[0].fame).toBe(0.1);        // any fame beats none
    expect(arr[2].fame).toBeUndefined();  // zero fame + zero peak is last
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npm test -- rank`
Expected: FAIL — `compareSzn` is not exported from `@/lib/prime`.

- [ ] **Step 3: Add `fame` to the `Player` interface**

In `web/lib/types.ts`, change the end of the `Player` interface (currently `peak_score?: number;` at line 53):

```ts
  peak_score?: number;
  fame?: number; // accolade-based recognizability score (data/build_fame.py); drives the "Top" sort
}
```

- [ ] **Step 4: Implement `compareSzn` in `prime.ts` and use it**

In `web/lib/prime.ts`, add after `peakVariant` (after line 32):

```ts
// Default "Top" board order: most-recognizable players for this team-era first. `fame` (accolade
// score from data/build_fame.py) leads; `peak_score` (VORP value) breaks ties and orders the
// un-accoladed tail. Pure so selectSpin (era pools) and buildPrimePools share one definition.
export function compareSzn(
  a: Pick<Player, "fame" | "peak_score">,
  b: Pick<Player, "fame" | "peak_score">,
): number {
  return (b.fame ?? 0) - (a.fame ?? 0) || (b.peak_score ?? 0) - (a.peak_score ?? 0);
}
```

Then replace the pool sort in `buildPrimePools` (line 57):

```ts
    pool.sort(compareSzn);
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `web/`): `npm test -- rank`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add web/lib/types.ts web/lib/prime.ts web/test/rank.test.ts
git commit -m "feat(rank): fame-first compareSzn comparator + Player.fame"
```

---

### Task 2: Composite pool sort + `rank` ordinal on candidates

**Files:**
- Modify: `web/lib/types.ts` (add `rank?` to `DraftCandidate`, ~line 83)
- Modify: `web/lib/data.ts:6` (import), `:91` (`toCandidate`), `:203-205` (`selectSpin` sort), `:231` (`spin` map), `:284` (`primeSpin` map)
- Test: `web/test/routes/spin.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `web/test/routes/spin.test.ts` (after the last `describe`):

```ts
describe("POST /api/spin — szn rank ordinal", () => {
  it("stamps each candidate with a sequential rank (0..n-1) in board order", async () => {
    const { body } = await readJson(await post({ seed: "classic-rank-001" }));
    const cands = body.candidates as Array<{ rank?: number }>;
    expect(cands.length).toBeGreaterThan(1);
    expect(cands.map((c) => c.rank)).toEqual(cands.map((_, i) => i));
  });

  it("stamps rank on prime candidates too", async () => {
    const { body } = await readJson(await post({ seed: "prime-rank-001" }));
    const cands = body.candidates as Array<{ rank?: number }>;
    expect(cands.map((c) => c.rank)).toEqual(cands.map((_, i) => i));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npm test -- spin`
Expected: FAIL — `rank` is `undefined` on candidates (`[undefined, undefined, ...]` ≠ `[0, 1, ...]`).

- [ ] **Step 3: Add `rank` to `DraftCandidate`**

In `web/lib/types.ts`, inside `DraftCandidate` (after the `traits?` line, ~line 83):

```ts
  traits?: TraitKey[];  // descriptive board tags derived from intrinsic stats (see lib/traits.ts) — informs without revealing fit
  rank?: number;        // server-assigned board ordinal (0 = top of the "Top"/szn order); client sorts "szn" by this
}
```

- [ ] **Step 4: Wire `data.ts` — import, sort, stamp**

In `web/lib/data.ts`:

(a) Update the prime import (line 6):

```ts
import { buildPrimePools, compareSzn, type PrimePools } from "./prime";
```

(b) Add a `rank` param to `toCandidate` (line 91) and set it:

```ts
function toCandidate(p: Player, fit?: CandidateFit, usage?: number, rank?: number): DraftCandidate {
  return {
    id: p.id, person_id: p.person_id, name: p.name, year: p.year, decade: p.decade, team: p.team,
    pos: p.pos, eligible: (p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot]),
    pts: p.pts, trb: p.trb, ast: p.ast, stl: p.stl, blk: p.blk, defense_estimated: p.defense_estimated, fit, usage,
    traits: playerTraits(p), rank,
  };
}
```

(c) Replace the `selectSpin` pool sort (lines 203-205):

```ts
  const pool = (draftIndex.get(`${team}|${decade}`) ?? [])
    .filter(available)
    .sort(compareSzn);
```

(d) Stamp the ordinal in `spin()` (line 231):

```ts
  const candidates = pool.map((p, i) => toCandidate(p, fits?.get(p.id), playerFeatures(p, coeff).usage, i));
```

(e) Stamp the ordinal in `primeSpin()` (line 284):

```ts
  return { team, decade: "PRIME", candidates: pool.map((p, i) => toCandidate(p, fits?.get(p.id), playerFeatures(p, coeff).usage, i)) };
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `web/`): `npm test -- spin`
Expected: PASS (all spin tests, including the 2 new rank tests).

- [ ] **Step 6: Commit**

```bash
git add web/lib/types.ts web/lib/data.ts web/test/routes/spin.test.ts
git commit -m "feat(rank): sort pools by compareSzn and stamp rank ordinal on candidates"
```

---

### Task 3: Browser "Top" sort + default + dropdown option

**Files:**
- Modify: `web/components/game/browser.tsx:8` (SortKey), `:43-45` (default + comment), `:47` (effSort), `:57` (comparator), `:101-102` (dropdown)
- Test: `web/test/components/browser.test.tsx` (rewrite R8 + add tests)

- [ ] **Step 1: Write the failing/updated tests**

Replace the entire R8 `describe` block (browser.test.tsx:20-32) with:

```tsx
import userEvent from "@testing-library/user-event";

describe("Browser — default 'Top' sort ranks by server rank (R8)", () => {
  it("defaults to server rank order, not PPG order and not input order", () => {
    // Zane is the top scorer and is listed first; Adam scores least but has the best rank (0).
    // PPG-default OR input-order would put Zane first — only rank-driven order puts Adam first.
    const spin = { team: "CHI", decade: "2000s", candidates: [
      cand({ id: "z", name: "Zane Zykov", pts: 30, rank: 1 }),
      cand({ id: "a", name: "Adam Aaronson", pts: 10, rank: 0 }),
    ] };
    render(<Browser spin={spin} {...baseProps} />);
    const rows = screen.getAllByRole("button", { name: /^Select / });
    expect(rows[0].getAttribute("aria-label")).toContain("Adam Aaronson");
    expect(rows[1].getAttribute("aria-label")).toContain("Zane Zykov");
  });
});

describe("Browser — sort options", () => {
  const spin = { team: "CHI", decade: "2000s", candidates: [
    cand({ id: "z", name: "Zane Zykov", pts: 30, trb: 5, rank: 1 }),
    cand({ id: "a", name: "Adam Aaronson", pts: 10, trb: 12, rank: 0 }),
  ] };
  const order = () =>
    screen.getAllByRole("button", { name: /^Select / }).map((r) => r.getAttribute("aria-label"));

  it("'Top' (default) orders by rank", () => {
    render(<Browser spin={spin} {...baseProps} />);
    expect(order()[0]).toContain("Adam Aaronson"); // rank 0
  });

  it("PPG sorts by points descending when selected", async () => {
    const user = userEvent.setup();
    render(<Browser spin={spin} {...baseProps} />);
    await user.selectOptions(screen.getByLabelText("Sort players"), "ppg");
    expect(order()[0]).toContain("Zane Zykov"); // 30 > 10
  });

  it("A–Z sorts alphabetically when selected", async () => {
    const user = userEvent.setup();
    render(<Browser spin={spin} {...baseProps} />);
    await user.selectOptions(screen.getByLabelText("Sort players"), "az");
    expect(order()[0]).toContain("Adam Aaronson");
  });
});
```

(Keep the existing R4 era-adjustment `describe` block unchanged. The `userEvent` import goes at the top with the other imports.)

- [ ] **Step 2: Run tests to verify they fail**

Run (from `web/`): `npm test -- browser`
Expected: FAIL — `"szn"` is not a valid `SortKey` / default is still A–Z so the new R8 and "Top" tests don't order by rank.

- [ ] **Step 3: Implement the `"szn"` sort in `browser.tsx`**

(a) `SortKey` (line 8):

```ts
export type SortKey = "szn" | "fit" | "ppg" | "rpg" | "apg" | "az";
```

(b) Replace the default-sort comment + initializer (lines 43-45):

```tsx
  // Default sort "Top" (szn): server-ranked so the recognizable players for this team-era lead
  // (fame, peak_score tiebreak). Replaces the old A–Z default — fame is archetype-diverse, so it
  // does NOT reintroduce the PPG high-scorer trap rule R8 guarded against. PPG/A–Z stay as options.
  const [sort, setSort] = useState<SortKey>(showFit ? "fit" : "szn");
```

(c) `effSort` fallback (line 47):

```tsx
  const effSort: SortKey = sort === "fit" && !showFit ? "szn" : sort;
```

(d) Comparator map (line 57) — add the `szn` key (ascending by rank; missing rank sinks last):

```tsx
    const key: Record<SortKey, (c: DraftCandidate) => number> = {
      szn: (c) => c.rank ?? Number.MAX_SAFE_INTEGER,
      fit: (c) => -(c.fit?.delta ?? -99), ppg: (c) => -(c.pts ?? 0), rpg: (c) => -(c.trb ?? 0), apg: (c) => -(c.ast ?? 0), az: () => 0,
    };
```

(e) Dropdown options (lines 101-102) — add "Top" as the first non-fit option:

```tsx
            {showFit && <option value="fit">Best fit</option>}
            <option value="szn">Top</option>
            <option value="az">A–Z</option><option value="ppg">PPG</option><option value="rpg">RPG</option><option value="apg">APG</option>
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `web/`): `npm test -- browser`
Expected: PASS (R8 rewrite + 3 sort-option tests + existing R4 tests).

- [ ] **Step 5: Run the FULL suite to catch tests that assumed the A–Z default**

Run (from `web/`): `npm test`
Expected: PASS. If any test fails because it asserted the old A–Z board order (likely candidates in `web/test/components/Game.*.test.tsx`), fix it: either give its fixture candidates explicit `rank` values matching the asserted order, or make the assertion sort-agnostic (assert membership, not position). Do NOT weaken a test to hide a real regression — only adjust assertions that were coupled to the now-removed default.

- [ ] **Step 6: Commit**

```bash
git add web/components/game/browser.tsx web/test/components/browser.test.tsx
git commit -m "feat(rank): add 'Top' (szn) sort to the draft board and make it the default"
```

---

## Phase B — Data pipeline (supplies real `fame`)

> No Python test harness exists in this repo (tests are Vitest only), so these tasks are
> verification-driven: run the script, inspect printed validation + the `players.json` diff.

### Task 4: Scrape awards + all-star pages

**Files:**
- Modify: `data/scrape.py:35-39` (the per-year `targets` list)

- [ ] **Step 1: Add the two URLs to `targets`**

In `data/scrape.py`, replace the `targets` list (lines 35-39):

```python
    targets = [
        (f"https://www.basketball-reference.com/leagues/NBA_{y}_per_game.html", f"{RAW}/NBA_{y}_per_game.html"),
        (f"https://www.basketball-reference.com/leagues/NBA_{y}_advanced.html", f"{RAW}/NBA_{y}_advanced.html"),
        (f"https://www.basketball-reference.com/leagues/NBA_{y}.html", f"{RAW}/NBA_{y}.html"),
        (f"https://www.basketball-reference.com/awards/awards_{y}.html", f"{RAW}/awards_{y}.html"),
        (f"https://www.basketball-reference.com/allstar/NBA_{y}.html", f"{RAW}/allstar_{y}.html"),
    ]
```

- [ ] **Step 2: Run the scraper (fetches only the new, uncached pages)**

Run (from repo root): `python data/scrape.py`
Expected: existing per_game/advanced/standings files report `cached`; new `awards_*.html` and `allstar_*.html` fetch (`ok NNNNB`) or, for missing seasons (e.g. the 1999 lockout all-star), `HTTP 404` — both are fine. Throttled at 3.6s, ~10 min for the ~150 new pages. Ends with `SCRAPE_COMPLETE`.

- [ ] **Step 3: Spot-check the cache**

Run (from repo root): `python -c "import os; print('awards', sum(1 for y in range(1950,2026) if os.path.exists(f'data/raw/awards_{y}.html')), 'allstar', sum(1 for y in range(1950,2026) if os.path.exists(f'data/raw/allstar_{y}.html')))"`
Expected: awards ~70, allstar ~73 (most seasons present). If both are ~0, the fetch failed — re-run Step 2 before continuing.

- [ ] **Step 4: Commit the scraper change**

```bash
git add data/scrape.py
git commit -m "feat(data): scrape Basketball-Reference awards + all-star pages"
```

(Do NOT commit `data/raw/` — confirm it is gitignored: `git check-ignore data/raw/awards_1996.html` should print the path. If it is not ignored, add `data/raw/` to `.gitignore` in this commit.)

---

### Task 5: `build_fame.py` — in-place fame enricher

**Files:**
- Create: `data/build_fame.py`

- [ ] **Step 1: Create the script**

Create `data/build_fame.py`:

```python
"""
Add a per-player `fame` score to web/public/data/players.json IN PLACE.

fame = recognizability from real accolades, aggregated per person (career):
    fame = 1.0*all_star_count + 3.0*mvp_share + 2.0*all_nba_share + 1.0*all_def_share
Source: Basketball-Reference awards/all-star pages cached by data/scrape.py.
Runs LAST in the pipeline (after build_dataset.py + enrich_players.mjs); only ADDS `fame`,
touches no other field. Players with no accolades get fame 0.0.
"""
import os, io, re, json, sys
import pandas as pd
sys.stdout.reconfigure(encoding="utf-8")

RAW = "data/raw"
PLAYERS = "web/public/data/players.json"
YEARS = range(1950, 2026)
W = {"all_star": 1.0, "mvp": 3.0, "all_nba": 2.0, "all_def": 1.0}

def slug(s):  # MUST match data/build_dataset.py's slug() so person_id keys line up
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_")

def read_html_clean(path):
    if not os.path.exists(path):
        return None
    html = open(path, encoding="utf-8", errors="replace").read()
    return html.replace("<!--", "").replace("-->", "")  # unwrap B-R commented tables

def flat_cols(df):
    df.columns = [c[-1] if isinstance(c, tuple) else c for c in df.columns]
    return df

def table_by_id(html, table_id):
    try:
        ts = pd.read_html(io.StringIO(html), attrs={"id": table_id})
        return flat_cols(ts[0]) if ts else None
    except (ValueError, KeyError):
        return None

def award_shares(year, table_ids):
    """slug -> summed vote share for the first matching award table id (mvp/all-nba/all-def)."""
    html = read_html_clean(f"{RAW}/awards_{year}.html")
    out = {}
    if html is None:
        return out
    df = None
    for tid in table_ids:               # e.g. ["mvp", "nba_mvp"] — prefer NBA, never ABA
        df = table_by_id(html, tid)
        if df is not None:
            break
    if df is None or "Player" not in df.columns:
        return out
    has_share = "Share" in df.columns
    for _, r in df.iterrows():
        name = str(r["Player"]).strip()
        if not name or name in ("Player", "nan", "League Average"):
            continue
        share = 0.5                      # fallback weight for older tables w/o a Share column
        if has_share:
            try:
                share = float(r["Share"])
            except (ValueError, TypeError):
                continue
            if share != share:           # NaN
                continue
        out[slug(name)] = out.get(slug(name), 0.0) + share
    return out

def allstars(year):
    """set of slugs of players on any all-star roster this season."""
    html = read_html_clean(f"{RAW}/allstar_{year}.html")
    s = set()
    if html is None:
        return s
    ids = [m for m in re.findall(r'<table[^>]*\bid="([^"]+)"', html) if m != "line_score"]
    skip = {"Starters", "Reserves", "Team Totals", "Totals", "nan", ""}
    for tid in ids:
        df = table_by_id(html, tid)
        if df is None or len(df.columns) == 0:
            continue
        first = df.columns[0]
        for v in df[first].astype(str):
            name = v.strip()
            if name in skip or name.startswith("Did Not") or name.startswith("Team"):
                continue
            s.add(slug(name))
    return s

def main():
    fame = {}  # slug -> {all_star, mvp, all_nba, all_def}

    def add(key, field, amt):
        fame.setdefault(key, {"all_star": 0, "mvp": 0.0, "all_nba": 0.0, "all_def": 0.0})[field] += amt

    for y in YEARS:
        for k in allstars(y):
            add(k, "all_star", 1)
        for k, sh in award_shares(y, ["mvp", "nba_mvp"]).items():
            add(k, "mvp", sh)
        for k, sh in award_shares(y, ["leading_all_nba"]).items():
            add(k, "all_nba", sh)
        for k, sh in award_shares(y, ["leading_all_defense"]).items():
            add(k, "all_def", sh)

    def score(d):
        return round(W["all_star"] * d["all_star"] + W["mvp"] * d["mvp"]
                     + W["all_nba"] * d["all_nba"] + W["all_def"] * d["all_def"], 4)

    players = json.load(open(PLAYERS, encoding="utf-8"))
    n_fame = 0
    for p in players:
        key = p.get("person_id") or slug(p["name"])
        d = fame.get(key)
        p["fame"] = score(d) if d else 0.0
        if d:
            n_fame += 1
    json.dump(players, open(PLAYERS, "w", encoding="utf-8"), allow_nan=False)

    # ---- validation (eyeballed) ----
    by_person = {}
    for p in players:
        by_person[p.get("person_id") or slug(p["name"])] = (p["name"], p["fame"])
    top = sorted(by_person.values(), key=lambda x: -x[1])[:20]
    print(f"accolade people={len(fame)}  player rows w/ fame>0={n_fame}/{len(players)}")
    print("top 20 player rows by fame:")
    for name, f in top:
        print(f"  {f:8.2f}  {name}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run (from repo root): `python data/build_fame.py`
Expected: prints `accolade people=...` and a "top 20 by fame" list. **Sanity gate:** the top 20 must be widely-recognized stars — Kareem Abdul-Jabbar, Michael Jordan, LeBron James, Bill Russell, Wilt Chamberlain, Kobe Bryant, Tim Duncan tier. If the top 20 is full of obscure names or everyone is `0.00`, person_id↔award-name slugs are not matching — STOP and debug `slug()` parity / table parsing before committing.

- [ ] **Step 3: Verify the diff is fame-only**

Run (from repo root): `git diff --stat web/public/data/players.json` (should show one file changed) and
`python -c "import json,subprocess; old=json.loads(subprocess.check_output(['git','show','HEAD:web/public/data/players.json'])); new=json.load(open('web/public/data/players.json',encoding='utf-8')); ks=lambda d:{k for p in d for k in p}; print('added keys:', ks(new)-ks(old)); print('removed keys:', ks(old)-ks(new)); print('same length:', len(old)==len(new))"`
Expected: `added keys: {'fame'}`, `removed keys: set()`, `same length: True`. Anything else means more than `fame` changed — investigate before committing.

- [ ] **Step 4: Commit the script + regenerated data**

```bash
git add data/build_fame.py web/public/data/players.json
git commit -m "feat(data): add per-player fame score from accolades (build_fame.py)"
```

---

### Task 6: Verify the real ranking end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Re-run the full test suite against real `fame`**

Run (from `web/`): `npm test`
Expected: PASS. The rank/sort tests are data-independent and still pass; the server now sorts real pools by `fame`.

- [ ] **Step 2: Confirm a known team-era pool is icon-first**

Run (from `web/`):

```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('public/data/players.json','utf8'));const pool=p.filter(x=>x.team==='CHI'&&x.decade==='1990s').sort((a,b)=>(b.fame||0)-(a.fame||0)||(b.peak_score||0)-(a.peak_score||0));console.log(pool.slice(0,5).map(x=>x.name+' (fame '+x.fame+')'))"
```

Expected: Michael Jordan and Scottie Pippen lead (Dennis Rodman high), confirming fame ordering surfaces the expected names. Repeat for `LAL`/`1980s` (Magic/Kareem/Worthy) if desired.

- [ ] **Step 3: (Optional) Eyeball in the running app**

Use the `/run` or `verify` flow to launch the app, spin a well-known team-era in Classic, and confirm the default board ("Top") shows the recognizable players first. Switch the dropdown to A–Z/PPG to confirm those still work.

---

## Phase C — Ship

### Task 7: Open the PR

- [ ] **Step 1: Final full suite + lint**

Run (from `web/`): `npm test` then `npm run lint`
Expected: both clean.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/sweepszn-rank-sort
gh pr create --title "feat: SweepSzn Rank — fame-anchored default 'Top' sort" --body "Implements docs/specs/2026-06-17-sweepszn-rank-design.md. New 'Top' sort ranks each team-era pool by a per-player fame score (All-Star + MVP + All-NBA + All-Defensive vote share, peak_score tiebreak) and is the new default, replacing A–Z. Server owns the ranking (compareSzn + rank ordinal); fame added in place by data/build_fame.py."
```

Expected: PR opened against `main`.

---

## Self-review notes (done while writing)

- **Spec coverage:** ranking algorithm → Task 5 (fame) + Task 1 (compareSzn); server wiring + `rank` → Task 2; client `szn` sort/default + label "Top" → Task 3; R8 rewrite + tests → Task 3; scrape feasibility → Task 4; mode scope (all 7 sortable; fit unchanged) → Task 3 (single Browser path, hoopiq still hides control). Championships/badges explicitly out of scope (not implemented). ✓
- **Type consistency:** `compareSzn(a, b)` signature identical in Task 1 (def) and Task 2 (use); `toCandidate(p, fit?, usage?, rank?)` 4-arg form used identically in `spin` and `primeSpin`; `rank?: number` on `DraftCandidate` matches `c.rank` reads in `browser.tsx` and the spin test. ✓
- **No placeholders:** every code step shows full content; commands have expected output. ✓
- **Known integration risk flagged:** Task 3 Step 5 handles other tests that may have assumed the A–Z default.
