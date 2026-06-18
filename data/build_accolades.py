"""
Emit per-person accolade COUNTS to web/public/data/accolades.json for the Player Dossier.

Reuses build_fame.py's Basketball-Reference parsing. Where `fame` is a weighted vote-share scalar,
this records human-countable selections a fan recognizes: All-Star games, MVP wins, All-NBA teams,
All-Defensive teams. Source: the cached B-R awards/all-star pages (data/raw). Run after build_fame.py.
Keyed by person_id (slug), the same key players.json uses; only ADDS a file, mutates nothing.
"""
import json, sys
sys.path.insert(0, "data")
from build_fame import read_html_clean, table_by_id, slug, allstars, RAW, YEARS  # noqa: E402

PLAYERS = "web/public/data/players.json"
OUT = "web/public/data/accolades.json"
TIERS = {"1st", "2nd", "3rd"}


def mvp_winners(year):
    html = read_html_clean(f"{RAW}/awards_{year}.html")
    if html is None:
        return []
    df = None
    for tid in ("mvp", "nba_mvp"):  # prefer NBA, never ABA
        df = table_by_id(html, tid)
        if df is not None:
            break
    if df is None or "Player" not in df.columns or "Rank" not in df.columns:
        return []
    out = []
    for _, r in df.iterrows():
        if str(r["Rank"]).strip() in ("1", "1T"):
            name = str(r["Player"]).strip()
            if name and name not in ("Player", "nan", "League Average"):
                out.append(slug(name))
    return out


def team_selections(year, table_id):
    """[(slug, tier)] for players actually selected to a team that year ('# Tm' in 1st/2nd/3rd)."""
    html = read_html_clean(f"{RAW}/awards_{year}.html")
    if html is None:
        return []
    df = table_by_id(html, table_id)
    if df is None or "Player" not in df.columns or "# Tm" not in df.columns:
        return []
    out = []
    for _, r in df.iterrows():
        tier = str(r["# Tm"]).strip()
        if tier in TIERS:
            name = str(r["Player"]).strip()
            if name and name not in ("Player", "nan", "League Average"):
                out.append((slug(name), tier))
    return out


def main():
    acc = {}

    def rec(k):
        return acc.setdefault(k, {"as": 0, "mvp": 0, "anba": 0, "anba1": 0, "adef": 0})

    for y in YEARS:
        for k in allstars(y):
            rec(k)["as"] += 1
        for k in mvp_winners(y):
            rec(k)["mvp"] += 1
        for k, tier in team_selections(y, "leading_all_nba"):
            rec(k)["anba"] += 1
            if tier == "1st":
                rec(k)["anba1"] += 1
        for k, _ in team_selections(y, "leading_all_defense"):
            rec(k)["adef"] += 1

    players = json.load(open(PLAYERS, encoding="utf-8"))
    pids = {p.get("person_id") or slug(p["name"]) for p in players}
    out = {k: v for k, v in acc.items() if k in pids and any(v.values())}
    json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))

    print(f"accolades.json: {len(out)} people written (of {len(acc)} accoladed; {len(pids)} draftable ids)")
    for k, v in sorted(out.items(), key=lambda kv: -kv[1]["as"])[:12]:
        print(f"  {k:26s} AS={v['as']:2d} MVP={v['mvp']} All-NBA={v['anba']}({v['anba1']} 1st) All-Def={v['adef']}")


if __name__ == "__main__":
    main()
