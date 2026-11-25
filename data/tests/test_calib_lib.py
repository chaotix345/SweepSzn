import math

from card_model import DEFAULT_PARAMS, CardParams, rate
from calib_lib import baseline_rating, track_b_rating, ood_fire_rate, lineup_penalties, year_folds

COEFF = {
    "zCap": 3.3,
    "offModel": {"intercept": 0.0, "pts": 1.0, "ast": 0.0, "ts": 0.0},
    "defModelEst": {"intercept": 0.0, "dws": 0.0},
    "defEstCap": 5.5, "dwsShrinkK": 40, "leagueDwsMean": 0.02,
    "usageBudget": 110.0, "usageFloor": 90.0, "overloadGamma": 0.2, "overloadPow": 1.0,
    "shortfallGamma": 0.3, "noRimPenalty": 7.0, "thinPerimeterPenalty": 3.0,
    "rim": {"blkLo": 0.4, "blkSpan": 1.4, "trbProxyLo": 0.8, "trbProxySpan": 1.6},
    "coverage": {"trbLo": -0.2, "trbSpan": 1.0, "stlLo": 0.0, "stlSpan": 1.0},
}


def s(year, obpm, dbpm, g=80, mp=34.0, **kw):
    r = {"name": "X", "year": year, "team": "AAA", "pos": "SF", "tier": "complete", "g": g, "mp": mp,
         "obpm": obpm, "dbpm": dbpm, "usg": 20.0, "dws": 3.0, "z": {}}
    r.update(kw)
    return r


def test_track_b_rows_exclude_target_season():
    seasons = [s(2004, 1.0, 0.0), s(2005, 9.0, 3.0), s(2006, 2.0, 1.0)]
    p = CardParams(decay=0.8, prior_k=300.0, prior_off=(-1.0, 0.05), prior_def=(0.0, 0.0))
    got = track_b_rating(seasons, 2005, 34.0, p, COEFF)
    assert got == rate(seasons, 2005, p, COEFF, exclude_year=2005, card_mpg=34.0)


def test_baseline_is_mean_of_adjacent_raw_bpm():
    seasons = [s(2004, 1.0, 0.0), s(2005, 9.0, 3.0), s(2006, 3.0, 2.0), s(2008, 7.0, 7.0), s(2006, 5.0, 0.0, g=10)]
    off, d = baseline_rating(seasons, 2005, COEFF)
    assert math.isclose(off, 2.0) and math.isclose(d, 1.0)
    assert baseline_rating([s(2005, 9.0, 3.0)], 2005, COEFF) == (0.0, 0.0)


def test_ood_fire_rate_counts_penalties_over_threshold():
    vals = [0.0] * 97 + [0.2, 0.5, 3.0]
    assert math.isclose(ood_fire_rate(vals), 0.03)


def test_lineup_penalties_zero_inside_usage_band_and_with_a_big():
    big = s(2005, 0, 0, pos="C", z={"blk": 2.0, "trb": 2.0})
    wing = s(2005, 0, 0, pos="SF", z={"stl": 1.2})
    five = [dict(big, usg=20.0)] + [dict(wing, usg=20.0)] * 4
    pen = lineup_penalties(five, COEFF)
    assert pen == {"overload": 0.0, "shortfall": 0.0, "rim": 0.0, "perim": 0.0}


def test_lineup_penalties_shortfall_and_overload():
    wing = s(2005, 0, 0, pos="SF", z={"stl": 1.2})
    low = [dict(wing, usg=16.0, pos="C", z={"blk": 2.0, "stl": 0})] + [dict(wing, usg=16.0)] * 4
    assert math.isclose(lineup_penalties(low, COEFF)["shortfall"], 0.3 * 10)
    high = [dict(wing, usg=26.0, pos="C", z={"blk": 2.0, "stl": 0})] + [dict(wing, usg=26.0)] * 4
    assert math.isclose(lineup_penalties(high, COEFF)["overload"], 0.2 * 20)


def test_year_folds_match_calibrate_construction():
    folds = year_folds(list(range(1985, 2026)))
    assert len(folds) == 10
    assert sorted(y for f in folds for y in f) == list(range(1985, 2026))


def test_no_big_lineup_pays_interior_with_partial_rebounding_credit():
    guards = [s(2005, 0, 0, pos="PG", usg=20.0, z={"trb": 0.3})] * 5
    assert math.isclose(lineup_penalties(guards, COEFF)["rim"], 7.0 * (1 - 0.5))
    bigs = [s(2005, 0, 0, pos="C", usg=20.0, z={"stl": -1.0})] * 5
    assert math.isclose(lineup_penalties(bigs, COEFF)["perim"], 3.0)
