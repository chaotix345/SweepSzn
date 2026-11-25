"""
Offline RAPM input for card_model.py (engine accuracy v4).

RAPM is a FITTING TARGET only: it tunes the weights that turn box-score seasons into card ratings.
The raw values never leave data/raw/ and data/out/ (both gitignored) and are never committed.

Source: nbarapm.com's public multi-year RAPM table (GET /load/SCALEDOUTPUT_SMALLER, cached to
data/raw/rapm/). Each 3-year window ending in Latest_Year is used as the target for its CENTER season
(Latest_Year - 1, B-R season-ending convention). A manually placed season-level CSV at
data/raw/rapm/rapm.csv (name,year,o,d[,poss]) overrides the download. If neither is available the
script exits 0 without writing data/out/rapm.json and the pipeline runs B-Ref-only
(_meta.rapm_used=false).

Writes data/out/rapm.json = {"source": str, "rows": [{name, year, o, d, poss}]} only when at least
MIN_MATCH of 1997+ starter seasons (>= 1000 min) find a RAPM row by normalized name + year.
"""
import csv, json, os, re, sys, unicodedata

RAW = "data/raw/rapm"
CSV = f"{RAW}/rapm.csv"
URL = "https://nbarapm.com/load/SCALEDOUTPUT_SMALLER"
CACHE = f"{RAW}/scaled_output.json"
OUT = "data/out/rapm.json"
MIN_MATCH = 0.90
MIN_MINUTES = 1000
FIRST_PBP_YEAR = 1998  # first center season of a 3-year play-by-play RAPM window (1997-99)


def normalize_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().replace("*", "")
    s = re.sub(r"[.'`’]", "", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _key(name, year):
    return (normalize_name(name), int(year))


def match_rate(rapm_rows, seasons, min_mp=MIN_MINUTES) -> float:
    have = {_key(r["name"], r["year"]) for r in rapm_rows}
    want = [s for s in seasons
            if s["year"] >= FIRST_PBP_YEAR and (s.get("g") or 0) * (s.get("mp") or 0) >= min_mp]
    if not want:
        return 0.0
    return sum(1 for s in want if _key(s["name"], s["year"]) in have) / len(want)


def load_csv(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                rows.append({"name": r["name"], "year": int(r["year"]), "o": float(r["o"]), "d": float(r["d"]),
                             "poss": int(float(r["poss"])) if r.get("poss") else None})
            except (KeyError, ValueError):
                continue
    return rows


def rows_from_windows(windows, interval="3Y"):
    """3-year RAPM windows -> rows keyed to the window's center season."""
    out = []
    for w in windows:
        if w.get("Year_Interval") != interval:
            continue
        try:
            out.append({"name": w["player_name"], "year": int(w["Latest_Year"]) - 1,
                        "o": float(w["Off_RAPM"]), "d": float(w["Def_RAPM"]),
                        "poss": int(w["Off_Poss"]) if w.get("Off_Poss") not in (None, "") else None})
        except (KeyError, TypeError, ValueError):
            continue
    return out


def download():
    import urllib.request
    os.makedirs(RAW, exist_ok=True)
    if not os.path.exists(CACHE):
        with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "sweepszn-data-pipeline"}), timeout=120) as r:
            open(CACHE, "wb").write(r.read())
    return json.load(open(CACHE, encoding="utf-8"))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if os.path.exists(CSV):
        rows = load_csv(CSV)
    else:
        try:
            rows = rows_from_windows(download())
        except Exception as e:
            print(f"RAPM download failed ({e}); pipeline will run B-Ref-only. Place a season-level CSV "
                  f"(name,year,o,d[,poss]) at {CSV} to enable it.")
            return 0
    seasons = json.load(open("data/out/team_player_seasons.json", encoding="utf-8"))
    rate = match_rate(rows, seasons)
    print(f"RAPM rows={len(rows)}  match rate (1997+, >= {MIN_MINUTES} min) = {rate:.3f}")
    if rate < MIN_MATCH:
        if os.path.exists(OUT):
            os.remove(OUT)
        print(f"match rate below {MIN_MATCH}: NOT writing {OUT} (fix name matching or the source)")
        return 0
    json.dump({"source": CSV if os.path.exists(CSV) else URL, "match_rate": round(rate, 4), "rows": rows},
              open(OUT, "w", encoding="utf-8"))
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
