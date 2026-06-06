import re, sys, io
import pandas as pd
sys.stdout.reconfigure(encoding="utf-8")

def read_tables(path):
    html = open(path, encoding="utf-8", errors="replace").read()
    # B-R hides many tables inside HTML comments to deter scrapers; unwrap them
    html = html.replace("<!--", "").replace("-->", "")
    return pd.read_html(io.StringIO(html))

def find_table_with(tables, cols):
    for i, t in enumerate(tables):
        flat = [str(c[-1]) if isinstance(c, tuple) else str(c) for c in t.columns]
        if all(any(col.lower() == f.lower() for f in flat) for col in cols):
            return i, t
    return None, None

print("================ PER GAME ================")
t = read_tables("data/raw/NBA_2023_per_game.html")
print("n tables:", len(t))
i, pg = find_table_with(t, ["Player", "PTS", "TRB", "AST"])
print("per_game table idx:", i, "shape:", pg.shape)
print("cols:", list(pg.columns))
print(pg.head(3).to_string())
print("has League Average row:", pg["Player"].astype(str).str.contains("League Average").any())

print("\n================ ADVANCED ================")
t = read_tables("data/raw/NBA_2023_advanced.html")
i, adv = find_table_with(t, ["Player", "TS%", "USG%", "BPM"])
print("advanced table idx:", i, "shape:", None if adv is None else adv.shape)
if adv is not None:
    print("cols:", list(adv.columns))
    print(adv[["Player","TS%","USG%","BPM","OBPM","DBPM","VORP"]].head(3).to_string())

print("\n================ SEASON PAGE TABLES ================")
t = read_tables("data/raw/NBA_2023.html")
print("n tables:", len(t))
for idx, tab in enumerate(t):
    flat = [str(c[-1]) if isinstance(c, tuple) else str(c) for c in tab.columns]
    # team misc/advanced table has ORtg, DRtg, Pace
    if any("ortg" in f.lower() for f in flat) and any("pace" in f.lower() for f in flat):
        print(f"  [team misc] idx={idx} shape={tab.shape} cols={flat}")
        print(tab.head(3).to_string())
    if any(str(f).lower()=="w" for f in flat) and any("team" in str(c).lower() for c in flat):
        print(f"  [standings?] idx={idx} cols={flat[:8]}")
