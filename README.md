# 82-0 (better engine)

A rebuild of the viral [82-0.com](https://www.82-0.com) NBA team-builder with an engine that models basketball instead of summing box-score stats. Draft a five-player all-time lineup; the engine returns a simulated 82-game record. See `DESIGN.md` for the full rationale.

## Why this engine is different

The original sums per-game stats (PPG×0.46 + RPG×0.25 + …) with no era adjustment, so raw-stat monsters (Wilt) and ball-dominant stat-stuffers dominate. This version:

- **Era-normalizes** every stat to z-scores vs. that season's league (kills pace/scoring-environment inflation).
- Drafts **franchise-era player variants**: Miami LeBron, Cleveland LeBron, and Lakers LeBron are separate cards backed by their actual seasons, while the lineup still locks to one real LeBron.
- Uses **OBPM/DBPM** (Box Plus/Minus — validated points-per-100 impact) for 1974+, with z-score box proxies for older eras (rebound+position rim-protection prior so pre-1974 defenders like Russell keep their value).
- Applies a **continuous usage-overload penalty** — five ball-dominant stars can't all keep their numbers (one ball, finite shots).
- Scores **offense and defense separately** (≈ equal weight) and adds spacing / rim-protection / positional checks.
- Maps team ORtg/DRtg → wins via **Pythagorean expectation**, with all coefficients **fitted to 1,170 real NBA team-seasons** (the fit recovered the canonical exponent k≈14).

Result: a balanced two-way team beats a stat-stuffer; 82-0 is achievable but brutal (best lineup found ≈ 79–80 wins).

## Layout

```
DESIGN.md              engine + game design doc
data/                  offline Python pipeline (run once to (re)build data)
  scrape.py            throttled Basketball-Reference scraper -> data/raw/
  build_dataset.py     raw HTML -> web/public/data/{players,league_context}.json
                       players are one peak season per player/franchise/era
  calibrate.py         fits coefficients.json against real team-seasons
  out/                 intermediate (team_seasons.json, team_rotations.json)
web/                   Next.js 16 app (App Router)
  lib/engine.ts        the engine (pure, server-side)
  lib/types.ts         shared types
  lib/data.ts          server data loader + slot-machine spin
  app/api/             /api/spin, /api/evaluate
  components/Game.tsx  draft UI + breakdown card
  public/data/         generated JSON consumed at runtime
```

## Run

```bash
cd web
npm install        # already done by scaffold
npm run dev        # http://localhost:3000
```

## Rebuild the dataset (optional)

```bash
pip install pandas lxml numpy
python data/scrape.py          # ~13 min, throttled; resumable (skips cached files)
python data/build_dataset.py   # -> web/public/data/players.json, league_context.json
node   data/enrich_players.mjs # adds multi-position `eligible` + current-franchise `team` (82-0 parity; UI only, no recalibration)
python data/calibrate.py       # -> web/public/data/coefficients.json + calibration report
```

## Validate the engine

```bash
cd web
npx tsx lib/engine.test.ts     # behavior checks (stat-stuffer must lose to balanced)
npx tsx scripts/eval_real.ts   # runs real all-time lineups through the calibrated engine
```
