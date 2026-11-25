"""Helpers for calibrate.py's v4 sections (Track B, usage bounds, OOD fire rates)."""
import numpy as np

from card_model import rate, box_off, box_def, same_person

PERIM_POS = {"PG", "SG", "SF", "G"}
BIG_POS = {"C", "PF", "F"}


def year_folds(years, k=10, seed=7):
    """Same fold construction as calibrate.cv_wins (sorted unique years, rng(7) permutation)."""
    ys = sorted(set(years))
    perm = np.random.default_rng(seed).permutation(ys)
    return [list(map(int, f)) for f in np.array_split(perm, k)]


def track_b_rating(seasons, year, mpg, p, coeff, birth=None):
    """Out-of-season card rating: the target season contributes nothing (no leakage)."""
    return rate(seasons, year, p, coeff, exclude_year=year, card_mpg=mpg, card_birth=birth)


def baseline_rating(seasons, year, coeff, min_g=20, birth=None):
    """Naive out-of-season baseline: mean raw OBPM/DBPM of year-1 and year+1 seasons (any team)."""
    adj = [x for x in seasons if abs(x["year"] - year) == 1 and (x.get("g") or 0) >= min_g and same_person(x, birth)]
    if not adj:
        return 0.0, 0.0
    return (sum(box_off(x, coeff) for x in adj) / len(adj), sum(box_def(x, coeff) for x in adj) / len(adj))


def ood_fire_rate(values, threshold=0.2):
    values = list(values)
    return sum(1 for v in values if v >= threshold) / len(values) if values else 0.0


def _z(p, k):
    v = (p.get("z") or {}).get(k)
    return 0.0 if v is None else float(v)


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def rim_score(p, c):
    """Mirror of web/lib/engine.ts playerRimScore."""
    if p.get("pos") not in BIG_POS:
        return 0.0
    r = c["rim"]
    size = _clamp((_z(p, "trb") - r["trbProxyLo"]) / r["trbProxySpan"], 0, 1)
    if p.get("tier") == "complete" or p.get("dbpm") is not None:
        boost = 0.35 if (p.get("dbpm") or 0) >= 1.5 else 0.0
        block = _clamp((_z(p, "blk") - r["blkLo"]) / r["blkSpan"] + boost, 0, 1)
        return max(block, size)
    return size


def usage_demand(p, c):
    """Mirror of engine usageDemand: USG%, else (pre-1978) the fitted z-model, clamped to [5, 40].
    Without a usgModel in `c` a missing USG% counts as 20."""
    u = p.get("usg")
    if u is None or (isinstance(u, float) and np.isnan(u)):
        m = c.get("usgModel")
        if m is None:
            u = 20.0
        else:
            cap = c["zCap"]
            u = m["intercept"] + m["pts"] * _clamp(_z(p, "pts"), -cap, cap) + m["ast"] * _clamp(_z(p, "ast"), -cap, cap)
    return _clamp(float(u), 5, 40)


def lineup_penalties(five, c):
    """Mirror of the reasoned terms in web/lib/engine.ts lineupTerms (points per 100)."""
    usage = sum(usage_demand(p, c) for p in five)
    pw = c.get("overloadPow", 1.0)
    over = c["overloadGamma"] * max(0.0, usage - c["usageBudget"]) ** pw
    short = c.get("shortfallGamma", 0.0) * max(0.0, c.get("usageFloor", 0.0) - usage) ** pw
    cv = c["coverage"]
    size = max(size_cover(p, cv) for p in five)
    perim = max(1.0 if p.get("pos") in PERIM_POS else _clamp((_z(p, "stl") - cv["stlLo"]) / cv["stlSpan"], 0, 1) for p in five)
    return {"overload": over, "shortfall": short,
            "rim": c["noRimPenalty"] * (1 - size) + frontcourt_penalty(five, c["frontcourt"]),
            "perim": c["thinPerimeterPenalty"] * (1 - perim)}


def size_cover(p, cv):
    """Mirror of engine playerSizeCover: listed big, else max of height and rebounding credit."""
    if p.get("pos") in BIG_POS:
        return 1.0
    h = p.get("ht")
    by_ht = _clamp((h - cv["htLo"]) / cv["htSpan"], 0, 1) if h else 0.0
    return max(by_ht, _clamp((_z(p, "trb") - cv["trbLo"]) / cv["trbSpan"], 0, 1))


def frontcourt_penalty(five, fc):
    """Second-tallest player below the real-team floor (mirror of engine lineupTerms)."""
    hs = sorted((p["ht"] for p in five if p.get("ht")), reverse=True)
    if len(hs) < 2:
        return 0.0
    return fc["penalty"] * _clamp((fc["h2Floor"] - hs[1]) / fc["h2Span"], 0, 1)
