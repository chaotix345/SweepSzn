import math
import random

from card_model import CardParams, DEFAULT_PARAMS, season_inputs, rate, fit_input_weights

COEFF = {
    "zCap": 3.3,
    "offModel": {"intercept": 0.4328, "pts": 1.058, "ast": 0.6331, "ts": 0.9088},
    "defModelEst": {"intercept": -1.7504, "dws": 77.2445, "posC": 0.0613, "posPF": -0.2484,
                    "posSF": -0.1734, "posSG": -0.1265},
    "defEstCap": 5.5, "dwsShrinkK": 40, "leagueDwsMean": 0.02037,
}


def season(year, obpm=0.0, dbpm=0.0, g=80, mp=36.0, **kw):
    s = {"name": "X", "year": year, "team": "AAA", "pos": "SF", "tier": "complete", "g": g, "mp": mp,
         "obpm": obpm, "dbpm": dbpm, "usg": 20.0, "dws": 4.0, "z": {}}
    s.update(kw)
    return s


def params(**kw):
    base = dict(decay=0.7, prior_k=0.0, prior_off=(0.0, 0.0), prior_def=(0.0, 0.0),
                off_w={"obpm": 1.0}, def_w={"dbpm": 1.0})
    base.update(kw)
    return CardParams(**base)


def test_rate_single_season_equals_input_when_prior_k_zero():
    off, d = rate([season(2000, obpm=5.0, dbpm=2.0)], 2000, params(), COEFF)
    assert math.isclose(off, 5.0) and math.isclose(d, 2.0)


def test_rate_single_season_shrinks_toward_prior():
    p = params(prior_k=500.0, prior_off=(-2.0, 0.1))
    off, _ = rate([season(2000, obpm=8.0, mp=36.0)], 2000, p, COEFF)
    assert 1.6 < off < 8.0


def test_low_minutes_season_weighs_less():
    seasons = [season(2000, dbpm=1.0, mp=36.0), season(2001, dbpm=4.0, mp=24.0)]
    _, d = rate(seasons, 2001, params(decay=1.0), COEFF)
    assert d < 2.5


def test_exclude_year_drops_that_season():
    seasons = [season(2000, obpm=2.0), season(2001, obpm=10.0)]
    off, _ = rate(seasons, 2001, params(decay=1.0), COEFF, exclude_year=2001)
    assert math.isclose(off, 2.0)


def test_rate_ignores_seasons_outside_card_career_window():
    seasons = [season(2000, obpm=3.0), season(2015, obpm=-5.0)]
    off, _ = rate(seasons, 2000, params(decay=1.0), COEFF)
    assert math.isclose(off, 3.0)


def test_rate_with_no_usable_season_falls_back_to_prior():
    p = params(prior_k=500.0, prior_off=(-1.0, 0.0), prior_def=(0.5, 0.0))
    off, d = rate([season(2000, g=0)], 2000, p, COEFF, card_mpg=30.0)
    assert math.isclose(off, -1.0) and math.isclose(d, 0.5)


def test_pre1974_season_uses_engine_fallback_models():
    z = {"pts": 4.0, "ast": 1.0, "ts": 0.5}
    s = season(1965, obpm=None, dbpm=None, z=z, tier="pre1974", g=80, dws=8.0, pos="C")
    off, d = season_inputs(s, DEFAULT_PARAMS, COEFF)
    m = COEFF["offModel"]
    assert math.isclose(off, m["intercept"] + m["pts"] * 3.3 + m["ast"] * 1.0 + m["ts"] * 0.5)
    de = COEFF["defModelEst"]
    eff = (8.0 / 80 * 80 + COEFF["leagueDwsMean"] * 40) / (80 + 40)
    assert math.isclose(d, min(de["intercept"] + de["dws"] * eff + de["posC"], 5.5))


def test_fit_input_weights_recovers_known_weights():
    rng = random.Random(3)
    seasons, rapm = [], []
    for i in range(400):
        dbpm, obpm, mp, g = rng.uniform(-3, 4), rng.uniform(-3, 8), rng.uniform(20, 38), 75
        dws = rng.uniform(0.5, 7.0)
        dws48 = dws / (g * mp) * 48
        s = season(2000 + i % 20, obpm=obpm, dbpm=dbpm, mp=mp, g=g, dws=dws, name=f"P{i}")
        seasons.append(s)
        rapm.append({"name": f"P{i}", "year": s["year"], "o": 0.8 * obpm, "d": 0.5 * dbpm + 4.0 * dws48})
    off_w, def_w = fit_input_weights(seasons, rapm)
    assert abs(off_w["obpm"] - 0.8) < 0.05
    assert abs(def_w["dbpm"] - 0.5) < 0.05
    assert abs(def_w["dws48"] - 4.0) < 0.2


def test_starter_translation_discounts_positive_low_minute_impact():
    p = params(minutes_alpha=1.0)
    off, d = rate([season(2000, obpm=4.0, dbpm=-1.0, mp=27.0)], 2000, p, COEFF)
    assert math.isclose(off, 3.0) and math.isclose(d, -1.0)
    off36, _ = rate([season(2000, obpm=4.0, mp=38.0)], 2000, p, COEFF)
    assert math.isclose(off36, 4.0)


def test_pre1974_dws_is_not_double_counted():
    z = {"pts": 0.0, "ast": 0.0, "ts": 0.0}
    hi = season(1965, obpm=None, dbpm=None, z=z, tier="partial", dws=12.0)
    p = params(def_w={"dws48": 10.0})
    assert season_inputs(hi, p, COEFF)[1] == season_inputs(dict(hi, dws=1.0), p, COEFF)[1]
