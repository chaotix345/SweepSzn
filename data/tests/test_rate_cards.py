import copy
import math

from rate_cards import rate_cards

COEFF = {
    "zCap": 3.3,
    "offModel": {"intercept": 0.0, "pts": 1.0, "ast": 0.0, "ts": 0.0},
    "defModelEst": {"intercept": 0.0, "dws": 10.0},
    "defEstCap": 5.5, "dwsShrinkK": 40, "leagueDwsMean": 0.02,
    "cardModel": {"decay": 0.7, "prior_k": 500.0, "prior_off": [-2.0, 0.05], "prior_def": [-0.5, 0.0],
                  "off_w": {"obpm": 1.0}, "def_w": {"dbpm": 1.0}},
}


def card(cid, name, year, obpm, dbpm, mp=35.0):
    return {"id": cid, "name": name, "year": year, "team": "AAA", "pos": "SF", "tier": "complete",
            "g": 80, "mp": mp, "pts": 25.0, "obpm": obpm, "dbpm": dbpm, "raw_obpm": obpm + 1, "z": {}}


def season(name, year, obpm, dbpm, mp=35.0):
    return {"name": name, "year": year, "team": "AAA", "pos": "SF", "tier": "complete", "g": 80, "mp": mp,
            "obpm": obpm, "dbpm": dbpm, "usg": 25.0, "dws": 4.0, "z": {}}


def test_rate_cards_preserves_ids_and_display_stats():
    players = [card("a_aaa_2000s_2005", "A Guy", 2005, 6.0, 2.0),
               card("b_aaa_1990s_1994", "B Guy", 1994, 0.1, 4.7, mp=30.0),
               card("c_aaa_2010s_2012", "C Guy", 2012, 1.0, 1.0)]
    before = copy.deepcopy(players)
    seasons = [season("A Guy", 2004, 3.0, 1.0), season("A Guy", 2005, 6.0, 2.0), season("A Guy", 2006, 4.0, 1.5),
               season("B Guy", 1994, 0.1, 4.7, mp=30.0), season("B Guy", 1995, -0.5, 2.0, mp=30.0)]
    out = rate_cards(players, seasons, COEFF)
    assert [p["id"] for p in out] == [p["id"] for p in before]
    for b, a in zip(before, out):
        assert {k: v for k, v in a.items() if k not in ("off_rating", "def_rating")} == b
        assert math.isfinite(a["off_rating"]) and math.isfinite(a["def_rating"])
    assert out[0]["off_rating"] < 6.0
    assert out[1]["def_rating"] < 4.7


def test_card_without_any_season_rows_gets_prior():
    out = rate_cards([card("c_aaa_2010s_2012", "C Guy", 2012, 1.0, 1.0)], [], COEFF)
    assert math.isclose(out[0]["off_rating"], -2.0 + 0.05 * 35.0, abs_tol=1e-3)
