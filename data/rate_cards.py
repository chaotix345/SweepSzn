"""
Write v4 card ratings into the committed draftable pool (engine accuracy v4, DESIGN.md §14).

Reads web/public/data/players.json (the frozen pool) and adds exactly two engine inputs per card:
off_rating / def_rating (BPM scale, before the engine's era-strength multiplier), from
card_model.rate with the coefficients.json cardModel. Ids, seasons, and every display stat are
left untouched, and the file is re-serialized byte-compatibly (json.dumps default separators).

Run after calibrate.py:  python data/rate_cards.py
"""
import json
import sys
from collections import defaultdict

from card_model import CardParams, rate
from fetch_rapm import normalize_name

PLAYERS = "web/public/data/players.json"
COEFF = "web/public/data/coefficients.json"
SEASONS = "data/out/team_player_seasons.json"


def rate_cards(players, seasons, coeff):
    cm = coeff["cardModel"]
    p = CardParams(decay=cm["decay"], prior_k=cm["prior_k"], prior_off=tuple(cm["prior_off"]),
                   prior_def=tuple(cm["prior_def"]), off_w=cm["off_w"], def_w=cm["def_w"])
    by_person = defaultdict(list)
    for s in seasons:
        by_person[normalize_name(s["name"])].append(s)
    out = []
    for card in players:
        o, d = rate(by_person[normalize_name(card["name"])], card["year"], p, coeff, card_mpg=card.get("mp") or 30.0)
        c = dict(card)
        c["off_rating"] = round(o, 3)
        c["def_rating"] = round(d, 3)
        out.append(c)
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    players = json.load(open(PLAYERS, encoding="utf-8"))
    coeff = json.load(open(COEFF, encoding="utf-8"))
    seasons = json.load(open(SEASONS, encoding="utf-8"))
    out = rate_cards(players, seasons, coeff)
    assert [c["id"] for c in out] == [c["id"] for c in players]
    open(PLAYERS, "w", encoding="utf-8").write(json.dumps(out))
    print(f"rated {len(out)} cards -> {PLAYERS}")


if __name__ == "__main__":
    main()
