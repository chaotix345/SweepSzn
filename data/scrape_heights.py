"""
Player heights for engine v4's lineup size term (DESIGN.md §14).

Fetches Basketball-Reference's player index pages (/players/a/ .. /players/z/, 26 pages, throttled and
cached in data/raw/ like scrape.py) and writes data/out/heights.json:
    [{"name": str, "from": int, "to": int, "ht": inches}]
`from`/`to` are the player's first/last season (season-ending year), used to tell namesakes apart.
"""
import io, json, os, sys, time, urllib.request
import pandas as pd

RAW = "data/raw"
OUT = "data/out/heights.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0 Safari/537.36"
THROTTLE = 3.6


def parse_height(ht):
    try:
        ft, inch = str(ht).split("-")
        return int(ft) * 12 + int(inch)
    except (ValueError, AttributeError):
        return None


def parse_index(html):
    tables = pd.read_html(io.StringIO(html.replace("<!--", "").replace("-->", "")))
    t = next(t for t in tables if "Ht" in t.columns and "Player" in t.columns)
    rows = []
    for _, r in t.iterrows():
        ht = parse_height(r["Ht"])
        if ht is None or pd.isna(r["From"]) or pd.isna(r["To"]):
            continue
        rows.append({"name": str(r["Player"]).replace("*", "").strip(), "from": int(r["From"]),
                     "to": int(r["To"]), "ht": ht})
    return rows


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(RAW, exist_ok=True)
    rows = []
    for letter in "abcdefghijklmnopqrstuvwxyz":
        dest = f"{RAW}/players_{letter}.html"
        if not (os.path.exists(dest) and os.path.getsize(dest) > 2000):
            req = urllib.request.Request(f"https://www.basketball-reference.com/players/{letter}/", headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    open(dest, "wb").write(r.read())
            except Exception as e:
                print(f"{letter}: {e}")
                time.sleep(THROTTLE)
                continue
            time.sleep(THROTTLE)
        rows += parse_index(open(dest, encoding="utf-8", errors="replace").read())
    json.dump(rows, open(OUT, "w", encoding="utf-8"))
    print(f"wrote {OUT}: {len(rows)} players")


if __name__ == "__main__":
    main()
