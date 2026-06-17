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
    # Slice out the <table id="..."> ... </table> block by id (B-R tables aren't nested), then parse
    # the fragment with the same default flavor build_dataset.py uses (attrs= would force html5lib).
    m = re.search(r'<table\b[^>]*\bid="' + re.escape(table_id) + r'".*?</table>', html, re.DOTALL)
    if not m:
        return None
    try:
        ts = pd.read_html(io.StringIO(m.group(0)))
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
    for tid in table_ids:               # e.g. ["mvp", "nba_mvp"] -- prefer NBA, never ABA
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

    # Self-monitor: accolade keys that matched NO player row. Most are legitimate (players outside
    # the draftable pool — pre-1960s, defunct franchises, or never a 25-game peak). But a HIGH-fame
    # unmatched key signals a name/slug mismatch (e.g. enrich_players.mjs normalized a name) silently
    # zeroing a real star's fame — investigate any current-era star that appears here.
    matched = {p.get("person_id") or slug(p["name"]) for p in players}
    unmatched = sorted(((score(d), k) for k, d in fame.items() if k not in matched), reverse=True)
    print(f"unmatched accolade keys: {len(unmatched)} (expected: players outside the draftable pool)")
    print("  highest-fame unmatched (a current-era star here = slug mismatch to fix):")
    for f, k in unmatched[:15]:
        print(f"    {f:8.2f}  {k}")

if __name__ == "__main__":
    main()
