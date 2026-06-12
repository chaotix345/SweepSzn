"""
Build app datasets from cached Basketball-Reference HTML.

Outputs (to web/public/data and data/out):
  players.json         - one PEAK season per player/franchise/era (the draftable pool), with raw box,
                         efficiency, advanced (OBPM/DBPM/BPM/USG/TS), per-season z-scores,
                         position, decade, data tier, and a defense-estimated flag.
  league_context.json  - per-season mean/SD for each stat + pace + league ORtg/TS%.
  team_seasons.json    - real team-seasons with actual W/ORtg/DRtg/NRtg/Pace + top rotation
                         (per-team player lines w/ z-scores) for engine calibration.
"""
import os, io, re, json, math, sys
import pandas as pd, numpy as np
sys.stdout.reconfigure(encoding="utf-8")

RAW = "data/raw"
OUT = "data/out"
WEBDATA = "web/public/data"
os.makedirs(OUT, exist_ok=True)
os.makedirs(WEBDATA, exist_ok=True)

def clean(o):
    """Recursively replace NaN/inf with None so outputs are valid JSON (json.dump emits a bare `NaN` otherwise,
    which JSON.parse / JSON.stringify in the app cannot read). Early seasons have NaN pace/lg_ortg."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o

def dump_json(obj, path):
    json.dump(clean(obj), open(path, "w", encoding="utf-8"), allow_nan=False)

# stats we z-score / carry (per-game)
BOX = ["pts", "trb", "orb", "drb", "ast", "stl", "blk", "tov"]
QUAL_G = 25          # min games to count toward league distribution & peak candidacy
QUAL_MP = 20.0       # min minutes/game (when MP available)
PEAK_MIN_G = 40      # prefer fuller seasons for peak selection

def read_tables(path):
    html = open(path, encoding="utf-8", errors="replace").read()
    html = html.replace("<!--", "").replace("-->", "")  # unwrap B-R commented tables
    try:
        return pd.read_html(io.StringIO(html))
    except ValueError:
        return []

def flat_cols(df):
    df = df.copy()
    df.columns = [c[-1] if isinstance(c, tuple) else c for c in df.columns]
    return df

def num(s):
    return pd.to_numeric(s, errors="coerce")

def is_combined_team(t):
    t = str(t)
    return t == "TOT" or bool(re.match(r"^\d+TM$", t))

def decade_of(year):  # year = season END year (NBA_2023 -> 2022-23)
    return f"{((year - 1)//10)*10}s"

def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_")

def data_tier(year):
    if year >= 1974: return "complete"
    if year >= 1952: return "partial"
    return "primitive"

def load_per_game(year):
    p = f"{RAW}/NBA_{year}_per_game.html"
    if not os.path.exists(p): return None
    ts = read_tables(p)
    for t in ts:
        f = flat_cols(t)
        if "Player" in f.columns and "PTS" in f.columns:
            return f
    return None

def load_advanced(year):
    p = f"{RAW}/NBA_{year}_advanced.html"
    if not os.path.exists(p): return None
    ts = read_tables(p)
    for t in ts:
        f = flat_cols(t)
        if "Player" in f.columns and "TS%" in f.columns:
            return f
    return None

def load_team_misc(year):
    p = f"{RAW}/NBA_{year}.html"
    if not os.path.exists(p): return None
    ts = read_tables(p)
    for t in ts:
        f = flat_cols(t)
        cols = [str(c) for c in f.columns]
        if "ORtg" in cols and "Pace" in cols and "Team" in cols and "W" in cols:
            return f
    return None

def norm_pos(p):
    # Basketball-Reference's cached per_game HTML stores ONE primary position per
    # player-season (no "PF-SF" multi-pos in our raw cache), so this split is a no-op in
    # practice. Multi-position ELIGIBILITY (truer to 82-0) is added afterwards by
    # data/enrich_players.mjs, which joins 82-0's authentic `positions` arrays + normalizes
    # `team` to a current franchise. Run it after this script:  node data/enrich_players.mjs
    p = str(p)
    if p in ("nan", ""): return "F"
    return p.split("-")[0]

# B-R team-name -> abbrev (current + common historical); fallback = first-letters
def abbr(team):
    t = str(team).replace("*", "").strip()
    return t  # we key rosters by full team name; the game uses peak team via player rows

def build():
    years = list(range(1950, 2026))
    league_ctx = {}
    pool_rows = []          # combined per-player-season (for pool + league dist)
    team_rows = []          # per-team per-player-season (for rosters)
    team_seasons = []       # real team-season outcomes

    for y in years:
        pg = load_per_game(y)
        if pg is None:
            continue
        adv = load_advanced(y)

        # ---- assemble per-row player-season records (per_game) ----
        pg = pg[pg["Player"].astype(str) != "Player"].copy()
        pg = pg[~pg["Player"].astype(str).str.contains("League Average", na=False)]
        rename = {"PTS":"pts","TRB":"trb","ORB":"orb","DRB":"drb","AST":"ast","STL":"stl",
                  "BLK":"blk","TOV":"tov","FG":"fg","FGA":"fga","3P":"fg3","3PA":"fg3a",
                  "FT":"ft","FTA":"fta","MP":"mp","G":"g","Team":"team","Pos":"pos","Age":"age"}
        for k in rename:
            if k not in pg.columns: pg[k] = np.nan
        pg = pg.rename(columns=rename)
        for c in BOX + ["fg","fga","fg3","fg3a","ft","fta","mp","g","age"]:
            pg[c] = num(pg[c])

        # advanced merge keys: Player + Team
        if adv is not None:
            adv = adv[adv["Player"].astype(str) != "Player"].copy()
            arename = {"TS%":"ts","USG%":"usg","OBPM":"obpm","DBPM":"dbpm","BPM":"bpm",
                       "VORP":"vorp","PER":"per","OWS":"ows","DWS":"dws","Team":"team"}
            for k in arename:
                if k not in adv.columns: adv[k] = np.nan
            adv = adv.rename(columns=arename)
            for c in ["ts","usg","obpm","dbpm","bpm","vorp","per","ows","dws"]:
                adv[c] = num(adv[c])
            adv_keyed = adv[["Player","team","ts","usg","obpm","dbpm","bpm","vorp","per","ows","dws"]]
            pg = pg.merge(adv_keyed, on=["Player","team"], how="left")
        else:
            for c in ["ts","usg","obpm","dbpm","bpm","vorp","per","ows","dws"]:
                pg[c] = np.nan

        # TS computed fallback if missing: PTS / (2*(FGA + 0.44*FTA))
        denom = 2*(pg["fga"].fillna(0) + 0.44*pg["fta"].fillna(0))
        ts_calc = np.where(denom > 0, pg["pts"]/denom, np.nan)
        pg["ts"] = pg["ts"].where(pg["ts"].notna(), ts_calc)

        # ---- league distribution from QUALIFIED, single/combined rows only ----
        combined = pg[pg["team"].apply(lambda t: is_combined_team(t)) | ~pg.duplicated("Player", keep=False)]
        # qualified mask
        qmp = combined["mp"].fillna(0) >= QUAL_MP if combined["mp"].notna().any() else True
        qg = combined["g"].fillna(0) >= QUAL_G
        qual = combined[qg & (qmp if isinstance(qmp, pd.Series) else True)]
        ctx = {"year": y, "decade": decade_of(y), "tier": data_tier(y), "n_qualified": int(len(qual))}
        for c in BOX + ["ts"]:
            vals = qual[c].dropna()
            ctx[c] = {"mean": float(vals.mean()) if len(vals) else None,
                      "sd": float(vals.std(ddof=0)) if len(vals) > 1 else None}
        # league pace + ORtg from team-misc League Average row
        tm = load_team_misc(y)
        ctx["pace"], ctx["lg_ortg"] = None, None
        if tm is not None:
            la = tm[tm["Team"].astype(str).str.contains("League Average", na=False)]
            if len(la):
                ctx["pace"] = float(num(la["Pace"]).iloc[0]) if "Pace" in tm.columns else None
                ctx["lg_ortg"] = float(num(la["ORtg"]).iloc[0]) if "ORtg" in tm.columns else None
        league_ctx[str(y)] = ctx

        def zof(row, stat):
            m = ctx.get(stat, {}).get("mean"); s = ctx.get(stat, {}).get("sd")
            v = row.get(stat)
            if m is None or s in (None, 0) or v is None or (isinstance(v, float) and math.isnan(v)):
                return None
            return round((v - m)/s, 4)

        # ---- pool rows (combined per player) ----
        for _, r in combined.iterrows():
            rec = {"name": str(r["Player"]), "year": y, "decade": decade_of(y), "tier": data_tier(y),
                   "team": str(r["team"]), "pos": norm_pos(r["pos"]), "age": (None if pd.isna(r["age"]) else float(r["age"])),
                   "g": (None if pd.isna(r["g"]) else float(r["g"])), "mp": (None if pd.isna(r["mp"]) else float(r["mp"]))}
            for c in BOX + ["fg","fga","fg3","fg3a","ft","fta","ts","usg","obpm","dbpm","bpm","vorp","per","ows","dws"]:
                v = r.get(c); rec[c] = (None if (v is None or (isinstance(v,float) and math.isnan(v))) else round(float(v),4))
            rec["z"] = {c: zof(r, c) for c in BOX + ["ts"]}
            pool_rows.append(rec)

        # ---- per-team rows (real-team rosters) ----
        per_team = pg[~pg["team"].apply(is_combined_team)]
        for _, r in per_team.iterrows():
            rec = {"name": str(r["Player"]), "year": y, "decade": decade_of(y), "tier": data_tier(y),
                   "team": str(r["team"]), "pos": norm_pos(r["pos"]),
                   "age": (None if pd.isna(r["age"]) else float(r["age"])),
                   "g": (None if pd.isna(r["g"]) else float(r["g"])),
                   "mp": (None if pd.isna(r["mp"]) else float(r["mp"]))}
            for c in BOX + ["fg","fga","fg3","fg3a","ft","fta","ts","usg","obpm","dbpm","bpm","vorp","per","ows","dws"]:
                v = r.get(c); rec[c] = (None if (v is None or (isinstance(v,float) and math.isnan(v))) else round(float(v),4))
            rec["z"] = {c: zof(r, c) for c in BOX + ["ts"]}
            team_rows.append(rec)

        # ---- real team-season outcomes for calibration ----
        if tm is not None:
            for _, r in tm.iterrows():
                name = str(r["Team"]).replace("*","").strip()
                if "League Average" in name or name in ("nan",""): continue
                ts_rec = {"year": y, "team_name": name}
                for col, key in [("W","w"),("L","l"),("ORtg","ortg"),("DRtg","drtg"),
                                 ("NRtg","nrtg"),("Pace","pace"),("SRS","srs"),("MOV","mov")]:
                    ts_rec[key] = (float(num(pd.Series([r[col]])).iloc[0]) if col in tm.columns and pd.notna(r[col]) else None)
                team_seasons.append(ts_rec)

    # ---- attach top rotation (per-team, top-by-MP) to each team-season ----
    # index team_rows by (year, team)
    from collections import defaultdict
    byteam = defaultdict(list)
    for tr in team_rows:
        byteam[(tr["year"], tr["team"])].append(tr)
    # map full team name -> abbrev used in per_game via the team-misc? We instead match on
    # team-season abbrev. team_rows team is the per_game 3-letter code; team_seasons team_name is full.
    # Build name->abbr by joining on (year) using standings? Simpler: keep rotations keyed by abbr,
    # and resolve full-name -> abbr at calibration time using a lookup built from a mapping table.
    dump_json({"team_rotations": {f"{k[0]}|{k[1]}": sorted(v, key=lambda x:-(x["mp"] or 0))[:8] for k,v in byteam.items()}},
              f"{OUT}/team_rotations.json")

    # ---- choose PEAK season per player/franchise/era for the draft pool ----
    # The game spins a franchise + decade, so players with meaningful stints in multiple
    # places should appear as separate cards (e.g. CLE/MIA/LAL LeBron). Each card uses
    # the actual best season from that franchise-era, while `person_id` lets the app lock
    # out the other variants once one real player is drafted.
    from collections import defaultdict as dd
    by_variant = dd(list)
    for r in team_rows:
        by_variant[(r["name"], r["team"], r["decade"])].append(r)

    def ok(v):
        return v is not None and not (isinstance(v, float) and math.isnan(v))

    def peak_score(r):
        # VORP is volume-aware: tiny-sample BPM noise scores ~0, real stars score high.
        if ok(r.get("vorp")):
            return float(r["vorp"])
        mp, g = (r.get("mp") or 0), (r.get("g") or 0)
        if ok(r.get("bpm")) and mp >= 15:
            return float(r["bpm"]) * (mp * g) / 1000.0   # approximate VORP for pre-VORP seasons
        zz = r["z"]
        comp = (zz.get("pts") or 0)*0.5 + (zz.get("ast") or 0)*0.3 + (zz.get("trb") or 0)*0.2
        return comp * (mp * g) / 1000.0

    # ---- 3-yr peak-window smoothing for elite cards (anti single-season-noise) ----
    # Peak selection takes a MAX over seasons, which preferentially selects upward noise: a
    # transcendent outlier year (2016 Curry OBPM 10.3; within-player OBPM sd ~1.2) gets treated
    # as durable ability. For ELITE peaks only -- where max-selection bias is strongest -- blend
    # the peak season's OBPM/DBPM with SAME-TEAM adjacent seasons (0.5 peak / 0.3 prior /
    # 0.2 next, weights renormalized when a neighbor is missing or <40 G). Gated per side
    # (OBPM > 4.0, DBPM > 3.5) and requiring 3+ seasons of 40+ G with that team, so short-stint
    # cards and ordinary peaks are untouched. Display box stats stay the raw peak season (card
    # identity); only the engine's impact inputs are smoothed, with the raw value kept alongside.
    # Real-team calibration inputs (team_rotations.json) keep ACTUAL season values: the fit maps
    # actual OBPM to actual results; smoothing is a predict-time estimate of card ability.
    season_idx = {}
    seasons_40g = dd(int)
    for r in team_rows:
        season_idx[(r["name"], r["team"], r["year"])] = r
        if (r["g"] or 0) >= 40:
            seasons_40g[(r["name"], r["team"])] += 1

    SMOOTH_W = [(0, 0.5), (-1, 0.3), (1, 0.2)]
    MAX_SHRINK = 1.5  # ~1.25x the within-player OBPM sd: smoothing corrects peak NOISE, so the
                      # correction is bounded at noise scale — a genuine MVP season next to a much
                      # weaker year (role change, injury comeback) can't be dragged below peak-1.5.
    def smooth_stat(best, key, gate):
        v = best.get(key)
        if not ok(v) or float(v) <= gate: return None
        if (best.get("g") or 0) < 40: return None
        if seasons_40g[(best["name"], best["team"])] < 3: return None
        parts = []
        for dy, w in SMOOTH_W:
            r = best if dy == 0 else season_idx.get((best["name"], best["team"], best["year"] + dy))
            if r is None or (r.get("g") or 0) < 40 or not ok(r.get(key)): continue
            parts.append((float(r[key]), w))
        if len(parts) < 2: return None  # no usable neighbor -> leave the raw peak
        tot = sum(w for _, w in parts)
        return round(max(sum(val * w for val, w in parts) / tot, float(v) - MAX_SHRINK), 4)

    pool = []
    for (name, team, decade), seasons in by_variant.items():
        cand = [s for s in seasons if (s["g"] or 0) >= QUAL_G and ((s["mp"] or 99) >= QUAL_MP)]
        if not cand:
            continue  # never a rotation-level player -> not in the draftable pool
        best = max(cand, key=peak_score)
        best = dict(best)
        so = smooth_stat(best, "obpm", 4.0)
        sdb = smooth_stat(best, "dbpm", 3.5)
        if so is not None:
            best["raw_obpm"] = best["obpm"]; best["obpm"] = so
        if sdb is not None:
            best["raw_dbpm"] = best["dbpm"]; best["dbpm"] = sdb
        person = slug(name)
        best["person_id"] = person
        best["id"] = f"{person}_{slug(team)}_{slug(decade)}_{best['year']}"
        best["defense_estimated"] = best["tier"] != "complete"  # no STL/BLK pre-1974
        best["peak_score"] = round(peak_score(best), 3)
        pool.append(best)

    pool.sort(key=lambda r: -(r["peak_score"] or -9))
    dump_json(pool, f"{WEBDATA}/players.json")
    dump_json(league_ctx, f"{WEBDATA}/league_context.json")
    dump_json(team_seasons, f"{OUT}/team_seasons.json")
    dump_json(pool_rows, f"{OUT}/all_player_seasons.json")  # for z->BPM calibration

    people = len({r["person_id"] for r in pool})
    print(f"players(pool)={len(pool)} variants for {people} people  player_seasons={len(pool_rows)}  team_seasons={len(team_seasons)}  seasons={len(league_ctx)}")
    print("NEXT: run `node data/enrich_players.mjs` to add multi-position eligibility + franchise normalization (UI only; no recalibration).")
    print("top 12 by peak_score:")
    for r in pool[:12]:
        print(f"  {r['name']:24s} {r['year']} {r['team']:4s} {r['pos']:3s} bpm={r.get('bpm')} pts={r.get('pts')} z_pts={r['z'].get('pts')}")

if __name__ == "__main__":
    build()
