"""
Write v4 card ratings into the committed draftable pool (engine accuracy v4, DESIGN.md §14).

Reads web/public/data/players.json (the frozen pool) and adds exactly two engine inputs per card:
off_rating / def_rating (BPM scale, before the engine's era-strength multiplier), from
card_model.rate with the coefficients.json cardModel, plus `ht` (inches, from scrape_heights.py) for
the engine's lineup size terms. Ids, seasons, and every display stat are
left untouched, and the file is re-serialized byte-compatibly (json.dumps default separators).

Run after calibrate.py:  python data/rate_cards.py
"""
import json
import sys
from collections import defaultdict

from card_model import CardParams, rate
from fetch_rapm import normalize_name
from heights import load_heights, height_of

PLAYERS = "web/public/data/players.json"
COEFF = "web/public/data/coefficients.json"
SEASONS = "data/out/team_player_seasons.json"


def rate_cards(players, seasons, coeff, heights=None):
    cm = coeff["cardModel"]
    p = CardParams(decay=cm["decay"], prior_k=cm["prior_k"], prior_off=tuple(cm["prior_off"]),
                   prior_def=tuple(cm["prior_def"]), off_w=cm["off_w"], def_w=cm["def_w"],
                   max_gap=int(cm.get("max_gap", 6)), minutes_alpha=float(cm.get("minutes_alpha", 0.0)))
    by_person = defaultdict(list)
    for s in seasons:
        by_person[normalize_name(s["name"])].append(s)
    out = []
    for card in players:
        birth = card["year"] - card["age"] if card.get("age") is not None else None
        o, d = rate(by_person[normalize_name(card["name"])], card["year"], p, coeff, card_mpg=card.get("mp") or 30.0,
                    card_birth=birth)
        c = dict(card)
        c["off_rating"] = round(o, 3)
        c["def_rating"] = round(d, 3)
        if heights is not None:
            c["ht"] = height_of(heights, card["name"], card["year"])
        out.append(c)
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    players = json.load(open(PLAYERS, encoding="utf-8"))
    coeff = json.load(open(COEFF, encoding="utf-8"))
    seasons = json.load(open(SEASONS, encoding="utf-8"))
    # cards with `since` were rated by data/add_season.py from seasons this build doesn't parse
    rated = iter(rate_cards([c for c in players if "since" not in c], seasons, coeff, load_heights()))
    out = [c if "since" in c else next(rated) for c in players]
    assert [c["id"] for c in out] == [c["id"] for c in players]
    open(PLAYERS, "w", encoding="utf-8").write(json.dumps(out))
    print(f"rated {len(out)} cards -> {PLAYERS}")


if __name__ == "__main__":
    main()
