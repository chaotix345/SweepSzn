"""Height lookup by (name, season) from data/out/heights.json (scrape_heights.py)."""
import json
from fetch_rapm import normalize_name


def load_heights(path="data/out/heights.json"):
    idx = {}
    for h in json.load(open(path, encoding="utf-8")):
        idx.setdefault(normalize_name(h["name"]), []).append(h)
    return idx


def height_of(idx, name, year):
    """Inches, or None. Namesakes are told apart by career span (one season of slack each side)."""
    for h in idx.get(normalize_name(name), []):
        if h["from"] - 1 <= year <= h["to"] + 1:
            return h["ht"]
    return None
