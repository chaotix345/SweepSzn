"""
Emit web/public/data/team_lookup.json keyed by "<team_name>|<year>" from data/out/team_seasons.json.

The first runtime source of real franchise-season ratings (W/L, ORtg, DRtg, NetRtg, SRS, MOV). Used
post-commit by the result card's Scouting Anchor (your five's projected ratings next to a comparable
real team's actuals) and the post-game "vs Real Team" compare. Descriptive history only (DESIGN.md §12);
adds a file, mutates nothing. Sibling to build_accolades.py. Run after build_dataset.py.
"""
import json

SRC = "data/out/team_seasons.json"
OUT = "web/public/data/team_lookup.json"


def main():
    rows = json.load(open(SRC, encoding="utf-8"))
    out = {}
    for r in rows:
        name, year = r.get("team_name"), r.get("year")
        if not name or year is None:
            continue
        out[f"{name}|{year}"] = {
            "team_name": name,
            "year": year,
            "w": r.get("w"),
            "l": r.get("l"),
            "ortg": r.get("ortg"),
            "drtg": r.get("drtg"),
            "nrtg": r.get("nrtg"),
            "srs": r.get("srs"),
            "mov": r.get("mov"),
        }
    # allow_nan=False guards against a stray NaN leaking non-standard JSON the JS reader can't parse.
    json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"), allow_nan=False)
    print(f"team_lookup.json: {len(out)} team-seasons written (of {len(rows)} rows)")


if __name__ == "__main__":
    main()
