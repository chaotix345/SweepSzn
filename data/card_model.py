"""
Card rating model (engine accuracy v4).

A card's engine rating answers "how good is this player as a 36+ minute starter on a contender",
not "how high was his single best box-score season". Each card is rated from ALL of the person's
team-seasons within MAX_GAP years of the card season (any team), weighted by minutes and by
recency to the card season, then Bayesian-shrunk toward a minutes-based prior:

    rating = (sum_s w_s * x_s + prior_k * prior(card_mpg)) / (sum_s w_s + prior_k)
    w_s    = g_s * mpg_s * decay ** |year_s - card_year|

x_s is one season's (off, def) impact on the BPM scale. 1974+ seasons use OBPM/DBPM through
linear input weights (identity by default; fitted against RAPM when available, so DBPM's
steal/block/rebound over-credit can be corrected with team-defense context via DWS/48 and minutes).
Pre-1974 seasons substitute the engine's own fallback models (offModel z-fit, defModelEst shrunk
DWS) for OBPM/DBPM, exactly as web/lib/engine.ts does, so all eras share one scale.
"""
from dataclasses import dataclass, field
import numpy as np

MAX_GAP = 6          # seasons further than this from the card season are ignored (namesakes, eras)
POS = ["C", "PF", "SF", "SG"]
DEF_FEATURES = ["dbpm", "dws48", "mpg", "posC", "posPF", "posSF", "posSG"]
OFF_FEATURES = ["obpm", "mpg", "usg"]
FIT_MIN_MINUTES = 1000
FIRST_PBP_YEAR = 1998  # first center season of a 3-year RAPM window


@dataclass
class CardParams:
    decay: float
    prior_k: float
    prior_off: tuple
    prior_def: tuple
    off_w: dict = field(default_factory=lambda: {"obpm": 1.0})
    def_w: dict = field(default_factory=lambda: {"dbpm": 1.0})
    max_gap: int = MAX_GAP
    minutes_alpha: float = 0.0   # starter translation: positive impact x min(1, mpg/36)^alpha


DEFAULT_PARAMS = CardParams(decay=0.7, prior_k=0.0, prior_off=(0.0, 0.0), prior_def=(0.0, 0.0))


def _ok(v):
    return v is not None and not (isinstance(v, float) and np.isnan(v))


def _pos_oh(pos):
    pos = {"F": "SF", "G": "SG"}.get(pos, pos)
    return {f"pos{q}": (1.0 if pos == q else 0.0) for q in POS}


def _zcap(s, k, cap):
    v = (s.get("z") or {}).get(k)
    v = 0.0 if not _ok(v) else float(v)
    return max(-cap, min(cap, v))


def box_off(s, coeff):
    """OBPM, or the engine's pre-1974 z-model substitute."""
    if _ok(s.get("obpm")):
        return float(s["obpm"])
    m, cap = coeff["offModel"], coeff["zCap"]
    return m["intercept"] + m["pts"] * _zcap(s, "pts", cap) + m["ast"] * _zcap(s, "ast", cap) + m["ts"] * _zcap(s, "ts", cap)


def box_def(s, coeff):
    """DBPM, or the engine's pre-1974 shrunk-DWS substitute (defModelEst, capped)."""
    if _ok(s.get("dbpm")):
        return float(s["dbpm"])
    m = coeff["defModelEst"]
    g = s.get("g") or 0
    raw = s["dws"] / g if _ok(s.get("dws")) and g > 0 else coeff["leagueDwsMean"]
    eff = (raw * g + coeff["leagueDwsMean"] * coeff["dwsShrinkK"]) / (g + coeff["dwsShrinkK"])
    pos = {"F": "SF", "G": "SG"}.get(s.get("pos"), s.get("pos"))
    v = m["intercept"] + m["dws"] * eff + m.get(f"pos{pos}", 0.0)
    return min(v, coeff["defEstCap"])


def features(s, coeff):
    g, mp = s.get("g") or 0, s.get("mp") or 0
    # Pre-1974 seasons already turn DWS into their DBPM substitute (box_def), so DWS/48 must not
    # enter a second time: they get the league-typical 0.1 (neutral under any weight).
    has_dbpm = _ok(s.get("dbpm"))
    dws48 = (float(s["dws"]) / (g * mp) * 48) if has_dbpm and _ok(s.get("dws")) and g * mp > 0 else 0.1
    f = {"obpm": box_off(s, coeff), "dbpm": box_def(s, coeff), "mpg": float(mp),
         "usg": float(s["usg"]) if _ok(s.get("usg")) else 20.0, "dws48": dws48}
    f.update(_pos_oh(s.get("pos")))
    return f


def _lin(w, f):
    return w.get("intercept", 0.0) + sum(v * f[k] for k, v in w.items() if k != "intercept")


def season_inputs(s, p: CardParams, coeff):
    if not (s.get("g") or 0) or not (s.get("mp") or 0):
        return None
    f = features(s, coeff)
    return _lin(p.off_w, f), _lin(p.def_w, f)


def same_person(s, card_birth):
    """Namesake guard: a season belongs to the card's player only if its birth year (season year minus
    age) is within a year of the card's. Seasons or cards without an age are kept."""
    if card_birth is None or s.get("age") is None:
        return True
    return abs((s["year"] - s["age"]) - card_birth) <= 1


def rate(seasons, card_year, p: CardParams, coeff, exclude_year=None, card_mpg=None, card_birth=None):
    if card_mpg is None:
        same = [s for s in seasons if s["year"] == card_year and s.get("mp")]
        card_mpg = max((s["mp"] for s in same), default=30.0)
    num_o = num_d = den = 0.0
    for s in seasons:
        dy = abs(s["year"] - card_year)
        if dy > p.max_gap or s["year"] == exclude_year or not same_person(s, card_birth):
            continue
        x = season_inputs(s, p, coeff)
        if x is None:
            continue
        w = s["g"] * s["mp"] * p.decay ** dy
        num_o += w * x[0]; num_d += w * x[1]; den += w
    po = p.prior_off[0] + p.prior_off[1] * card_mpg
    pd_ = p.prior_def[0] + p.prior_def[1] * card_mpg
    if den + p.prior_k == 0:
        o, d = po, pd_
    else:
        o, d = (num_o + p.prior_k * po) / (den + p.prior_k), (num_d + p.prior_k * pd_) / (den + p.prior_k)
    # Starter translation: a card plays 36+ minutes next to stars, so per-100 impact earned in a
    # smaller role is discounted (positive side only; a bad player doesn't get better with minutes).
    f = min(1.0, card_mpg / 36.0) ** p.minutes_alpha
    return (o * f if o > 0 else o, d * f if d > 0 else d)


def _norm(name):
    from fetch_rapm import normalize_name
    return normalize_name(name)


def fit_input_weights(seasons, rapm_rows, coeff=None):
    """OLS of RAPM offense/defense on the season input features (1997+, >= 1000 minutes)."""
    from calib_defaults import DEFAULT_COEFF
    coeff = coeff or DEFAULT_COEFF
    target = {(_norm(r["name"]), int(r["year"])): r for r in rapm_rows}
    Xo, Xd, yo, yd = [], [], [], []
    for s in seasons:
        if s["year"] < FIRST_PBP_YEAR or (s.get("g") or 0) * (s.get("mp") or 0) < FIT_MIN_MINUTES:
            continue
        r = target.get((_norm(s["name"]), int(s["year"])))
        if r is None or not _ok(s.get("dbpm")) or not _ok(s.get("obpm")):
            continue
        f = features(s, coeff)
        Xo.append([f[k] for k in OFF_FEATURES]); yo.append(r["o"])
        Xd.append([f[k] for k in DEF_FEATURES]); yd.append(r["d"])

    def ols(X, y, names):
        A = np.hstack([np.ones((len(X), 1)), np.asarray(X, float)])
        coef = np.linalg.lstsq(A, np.asarray(y, float), rcond=None)[0]
        w = {"intercept": float(coef[0])}
        w.update({n: float(coef[i + 1]) for i, n in enumerate(names)})
        return w
    return ols(Xo, yo, OFF_FEATURES), ols(Xd, yd, DEF_FEATURES)
