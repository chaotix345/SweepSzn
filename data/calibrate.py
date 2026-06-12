"""
Enhanced calibration v3 (engine-accuracy overhaul).

WHAT IS FITTED (in-distribution accuracy) vs REASONED (out-of-distribution face validity):

  FITTED from 1,170 real team-seasons (1985-2025) + 24,687 player-seasons:
    - offModel / defModel / usgModel : z-score -> OBPM/DBPM/USG fallbacks for pre-1974 players,
      fit on the 1974+ overlap using only features available pre-1974. z-scores are CAPPED at
      +/-ZCAP so a thin 8-team early league cannot manufacture a super-human z (the Mikan fix).
    - defModelEst : pre-1974 DEFENSE redone. The legacy defModel carried a perverse NEGATIVE trb
      coefficient (a collinearity artifact that punished rebounders). defModelEst drops trb and
      Bayesian-shrinks DWS/g toward the league mean, so noisy old-era role players regress to a
      position prior instead of ranking as all-time defenders (the Charlie Black / Nate McMillan fix).
    - core team map : ORtg = base + offScale*Sigma(top5 OBPM); DRtg = base - defScale*Sigma(top5 DBPM).
    - spacing perShooter : fit from real ORtg residuals vs lineup shooter-units (was hand-set 1.4).
    - Pythagorean k : end-to-end wins fit.
    - cv_wins_rmse : honest YEAR-GROUPED 10-fold out-of-sample wins RMSE (no leakage across a season).

  REASONED (data cannot fit them -- real teams never enter these regimes; see DESIGN.md):
    - eraStrength : a documented era-depth multiplier (<=1.0, ==1.0 for >=1985 so the modern
      calibration is untouched) applied to per-player impact for pre-1985 players.
    - overloadGamma, rebound (DRB deficit), rim (continuous), thinPerimeter : fantasy-regime
      penalties that are ~0 for any real lineup and only correct degenerate builds (5 ball-stoppers,
      5 point guards, no rim protection). The TOV/ORB/DRB diagnostic below proves adding them to the
      team regression does NOT improve held-out accuracy -- they belong in the fantasy regime, not the fit.

Writes web/public/data/coefficients.json.
"""
import json, sys, math
import numpy as np
sys.stdout.reconfigure(encoding="utf-8")

ZCAP = 3.3              # cap |z| at the modern-era ceiling (empirical max z_pts ~3.2-3.5 in deep leagues)
DWS_SHRINK_K = 40       # Bayesian shrinkage strength for pre-1974 DWS/g toward the league mean
DEF_EST_CAP = 5.5       # ceiling for estimated DBPM (max real DBPM in the 1974+ training data)
# Usage budget for the fantasy-regime overload penalty. The fit (gamma_fit below) proves the data
# cannot price overload in-range, so the penalty must be ~0 for real teams (DESIGN.md SS11) and only
# fire on degenerate stacks. Real top-5-by-MP season-USG sums (1985-2025, n=1170): p50=107.5,
# p75=111.8, p90=116.7, max=141.5 -- at the old budget of 100, 91.7% of real teams were penalized,
# contradicting the design intent. 110 puts the median real team at zero penalty while a
# five-ball-hog stack (sumUSG ~165) still pays ~12 pts of ORtg.
USAGE_BUDGET = 110
# Canonical Pythagorean exponent used to define the LUCK-FREE wins target (B-R's 13.91 ~= 14).
# Actual wins carry ~2.4 wins of mean-absolute close-game luck vs the same team's own expectation;
# measuring CV against pythag-expected wins removes that noise from the metric. The fitted bestk
# below maps PREDICTED ratings to this target (it need not equal 14 a priori).
PYTH_TARGET_K = 14.0

aps = json.load(open("data/out/all_player_seasons.json", encoding="utf-8"))
team_seasons = json.load(open("data/out/team_seasons.json", encoding="utf-8"))
rot = json.load(open("data/out/team_rotations.json", encoding="utf-8"))["team_rotations"]

def clean(o):
    """Recursively replace NaN/inf with None so the output is valid JSON (json.dump emits bare NaN otherwise)."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o

def fit(X, y, names):
    X = np.asarray(X, float); y = np.asarray(y, float)
    A = np.hstack([np.ones((len(X), 1)), X])
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    pred = A @ coef
    r2 = 1 - np.sum((y - pred) ** 2) / np.sum((y - np.mean(y)) ** 2)
    rmse = math.sqrt(np.mean((y - pred) ** 2))
    return {"intercept": float(coef[0]), **{n: float(coef[i + 1]) for i, n in enumerate(names)}}, r2, rmse

def zget(p, k):
    # NOTE: fit on UNCAPPED z (learn the true relationship over the full modern range).
    # ZCAP is applied only at PREDICTION time in the engine, for pre-1974 players whose thin-league
    # z would otherwise extrapolate beyond anything seen in training. Capping during the fit would
    # distort the coefficients (it did: it inflated the ts term and dropped offModel R2 0.61->0.53).
    z = p.get("z") or {}
    v = z.get(k)
    return None if v is None else float(v)

# league mean DWS/g among complete-tier players (prior for the Bayesian shrinkage)
_dwsr = [(p["dws"] / p["g"]) for p in aps if p["tier"] == "complete" and p.get("dws") is not None and p.get("g")]
LEAGUE_DWS_MEAN = float(np.mean(_dwsr))

# ---------- 1) z -> impact models on the 1974+ overlap (capped z) ----------
print("=== z -> impact fallback models (fit on 1974+ UNCAPPED z; engine applies |z|<=%.1f at predict time) ===" % ZCAP)
# OFFENSE: OBPM ~ z_pts, z_ast, z_ts
Xo, yo = [], []
for p in aps:
    if p["tier"] != "complete" or p.get("obpm") is None: continue
    zp, za, zt = zget(p, "pts"), zget(p, "ast"), zget(p, "ts")
    if None in (zp, za, zt): continue
    Xo.append([zp, za, zt]); yo.append(p["obpm"])
offModel, offR2, offRMSE = fit(Xo, yo, ["pts", "ast", "ts"])
print(f"OBPM ~ pts/ast/ts   n={len(yo)}  R2={offR2:.3f} RMSE={offRMSE:.2f}")
print("  ", {k: round(v, 3) for k, v in offModel.items()})

POS = ["C", "PF", "SF", "SG"]
def pos_oh(pos):
    pos = {"F": "SF", "G": "SG"}.get(pos, pos)
    return [1.0 if pos == q else 0.0 for q in POS]

# DEFENSE legacy: DBPM ~ dws/g + z_trb + position (kept for reporting / back-compat only)
Xd, yd = [], []
for p in aps:
    if p["tier"] != "complete" or p.get("dbpm") is None: continue
    zt = zget(p, "trb"); g = p.get("g"); dws = p.get("dws")
    if zt is None or not g or dws is None: continue
    Xd.append([dws / g, zt] + pos_oh(p["pos"])); yd.append(p["dbpm"])
defModel, defR2, defRMSE = fit(Xd, yd, ["dws", "trb"] + ["pos" + q for q in POS])
print(f"DBPM ~ dws+trb+pos  n={len(yd)}  R2={defR2:.3f} RMSE={defRMSE:.2f}  (LEGACY; perverse trb={defModel['trb']:.3f})")

# DEFENSE estimation model (used by the engine pre-1974): shrunk DWS/g + position, NO trb.
Xde, yde = [], []
for p in aps:
    if p["tier"] != "complete" or p.get("dbpm") is None: continue
    g = p.get("g"); dws = p.get("dws")
    if not g or dws is None: continue
    raw = dws / g
    eff = (raw * g + LEAGUE_DWS_MEAN * DWS_SHRINK_K) / (g + DWS_SHRINK_K)
    Xde.append([eff] + pos_oh(p["pos"])); yde.append(p["dbpm"])
defModelEst, defEstR2, defEstRMSE = fit(Xde, yde, ["dws"] + ["pos" + q for q in POS])
print(f"DBPM ~ shrunkDWS+pos n={len(yde)}  R2={defEstR2:.3f} RMSE={defEstRMSE:.2f}  (defModelEst, K={DWS_SHRINK_K}, no trb)")
print("  ", {k: round(v, 3) for k, v in defModelEst.items()})

# USAGE: USG ~ z_pts, z_ast
Xu, yu = [], []
for p in aps:
    if p.get("usg") is None: continue
    zp, za = zget(p, "pts"), zget(p, "ast")
    if None in (zp, za): continue
    Xu.append([zp, za]); yu.append(p["usg"])
usgModel, usgR2, usgRMSE = fit(Xu, yu, ["pts", "ast"])
print(f"USG ~ pts/ast       n={len(yu)}  R2={usgR2:.3f} RMSE={usgRMSE:.2f}")

# ---------- 2) team calibration ----------
NAME2ABBR = {
 "Atlanta Hawks":"ATL","Boston Celtics":"BOS","Chicago Bulls":"CHI","Cleveland Cavaliers":"CLE",
 "Dallas Mavericks":"DAL","Denver Nuggets":"DEN","Detroit Pistons":"DET","Golden State Warriors":"GSW",
 "Houston Rockets":"HOU","Indiana Pacers":"IND","Los Angeles Clippers":"LAC","Los Angeles Lakers":"LAL",
 "Miami Heat":"MIA","Milwaukee Bucks":"MIL","Minnesota Timberwolves":"MIN","New York Knicks":"NYK",
 "Orlando Magic":"ORL","Philadelphia 76ers":"PHI","Phoenix Suns":"PHO","Portland Trail Blazers":"POR",
 "Sacramento Kings":"SAC","San Antonio Spurs":"SAS","Toronto Raptors":"TOR","Utah Jazz":"UTA",
 "Washington Wizards":"WAS","Washington Bullets":"WSB","Memphis Grizzlies":"MEM","Vancouver Grizzlies":"VAN",
 "New Jersey Nets":"NJN","Brooklyn Nets":"BRK","Charlotte Bobcats":"CHA","New Orleans Hornets":"NOH",
 "New Orleans/Oklahoma City Hornets":"NOK","New Orleans Pelicans":"NOP","Oklahoma City Thunder":"OKC",
 "Seattle SuperSonics":"SEA","Kansas City Kings":"KCK","San Diego Clippers":"SDC",
}
def abbr_for(name, year):
    if name == "Charlotte Hornets": return "CHH" if year <= 2002 else "CHO"
    return NAME2ABBR.get(name)

def shooter_unit(p):
    if (p.get("year") or 0) < 1980: return 0.0
    a = p.get("fg3a") or 0
    if a < 1: return 0.0
    pct = (p.get("fg3") or 0) / a
    vol = max(0.0, min(1.0, (a - 1) / 4))
    acc = max(0.0, min(1.2, (pct - 0.31) / 0.06))
    return vol * acc

rows = []
for ts in team_seasons:
    y, name = ts["year"], ts["team_name"]
    if y < 1985 or ts.get("ortg") is None or ts.get("drtg") is None: continue
    l = ts.get("l")
    if not l or (ts["w"] + l) == 0: continue
    ab = abbr_for(name, y)
    pl = rot.get(f"{y}|{ab}") if ab else None
    if not pl or len(pl) < 5: continue
    top5 = pl[:5]
    if any(p.get("obpm") is None or p.get("dbpm") is None for p in top5): continue
    sumOff = sum(p["obpm"] for p in top5); sumDef = sum(p["dbpm"] for p in top5)
    usgs = [p.get("usg") for p in top5 if p.get("usg") is not None]
    su = sum(shooter_unit(p) for p in top5)
    tovs = [p.get("tov") for p in top5 if p.get("tov") is not None]
    orbs = [p.get("orb") for p in top5 if p.get("orb") is not None]
    drbs = [p.get("drb") for p in top5 if p.get("drb") is not None]
    rows.append({"year": y, "sumOff": sumOff, "sumDef": sumDef, "ortg": ts["ortg"], "drtg": ts["drtg"],
                 "w82": 82 * ts["w"]/(ts["w"]+l),
                 # luck-free wins target: the team's own Pythagorean expectation from its ACTUAL ratings
                 "wpyth": 82 * ts["ortg"]**PYTH_TARGET_K / (ts["ortg"]**PYTH_TARGET_K + ts["drtg"]**PYTH_TARGET_K),
                 "su": su,
                 "sumUsg": sum(usgs) if len(usgs) == 5 else None,
                 "sumTov": sum(tovs) if len(tovs) == 5 else None,
                 "sumOrb": sum(orbs) if len(orbs) == 5 else None,
                 "sumDrb": sum(drbs) if len(drbs) == 5 else None})

print(f"\n=== team calibration (n={len(rows)} team-seasons, 1985-2025) ===")
sO = np.array([r["sumOff"] for r in rows]); sD = np.array([r["sumDef"] for r in rows])
oR = np.array([r["ortg"] for r in rows]); dR = np.array([r["drtg"] for r in rows])
W = np.array([r["w82"] for r in rows]); WP = np.array([r["wpyth"] for r in rows])
YR = np.array([r["year"] for r in rows])

def lin(x, y):
    A = np.vstack([x, np.ones_like(x)]).T
    m, b = np.linalg.lstsq(A, y, rcond=None)[0]
    pred = m*x+b; r2 = 1-np.sum((y-pred)**2)/np.sum((y-y.mean())**2)
    return float(m), float(b), float(r2), float(math.sqrt(np.mean((y-pred)**2)))
bo, ao, r2o, rmseo = lin(sO, oR)
md, ad, r2d, rmsed = lin(sD, dR)
offScale, ortgBase = bo, ao
defScale, drtgBase = -md, ad
print(f"ORtg = {ao:.2f} + {bo:.3f}*ΣOBPM   R2={r2o:.3f} RMSE={rmseo:.2f}")
print(f"DRtg = {ad:.2f} {md:.3f}*ΣDBPM    R2={r2d:.3f} RMSE={rmsed:.2f}")

# ---- fit spacing perShooter from ORtg residuals (replaces hand-set 1.4) ----
resid = oR - (ortgBase + offScale*sO)
su = np.array([r["su"] for r in rows])
A = np.vstack([su, np.ones_like(su)]).T
spSlope, spInt = np.linalg.lstsq(A, resid, rcond=None)[0]
per_shooter_fit = float(spSlope)
print(f"\nspacing fit: ORtg_resid = {spInt:.3f} + {spSlope:.3f}*shooterUnits  -> perShooter={per_shooter_fit:.3f} (was hand-set 1.4)")

# ---- usage-overload gamma (cannot be fit; documented heuristic) ----
have_usg = [r for r in rows if r["sumUsg"] is not None]
res = np.array([r["ortg"] - (ortgBase + offScale*r["sumOff"]) for r in have_usg])
over = np.array([max(0.0, r["sumUsg"] - USAGE_BUDGET) for r in have_usg])
slope = np.linalg.lstsq(np.vstack([over, np.ones_like(over)]).T, res, rcond=None)[0][0] if over.std() > 0 else 0.0
gamma_fit = -float(slope)
print(f"usage-overload fit slope -> gamma_fit={gamma_fit:.4f} (real teams never stack 5 ball-stars; using heuristic 0.22 above budget {USAGE_BUDGET})")
gamma = 0.22

# ---- Pythagorean k (end-to-end, vs the luck-free pythag-wins target) ----
pO = ortgBase + offScale*sO; pD = drtgBase - defScale*sD
bestk, beste = 14.0, 1e9
for k in np.arange(8, 20.01, 0.25):
    wp = pO**k/(pO**k+pD**k); e = math.sqrt(np.mean((82*wp - WP)**2))
    if e < beste: beste, bestk = e, float(k)
assert 13.0 <= bestk <= 15.0, f"Pythagorean k={bestk} outside sane range [13,15] -- target definition regressed?"
print(f"Pythagorean k={bestk}  in-sample RMSE vs pythag-wins target={beste:.2f}")

# ---- honest YEAR-GROUPED 10-fold CV (no season leaks across folds) ----
def cv_wins(extra_off=None, extra_def=None, target=None):
    """10-fold CV grouped by season. extra_* are lists of row-keys added to the OLS design.
    target: wins array to measure against (default: luck-free pythag wins WP; pass W for actual).
    Uses the SAME fixed Pythagorean k=bestk the engine deploys (re-fitting k per fold would make
    the reported error optimistic vs the shipped fixed-k model)."""
    T = WP if target is None else target
    years = sorted(set(YR)); rngp = np.random.default_rng(7)
    yperm = rngp.permutation(years); folds = np.array_split(yperm, 10)
    errs = []
    def design(keys):
        cols = [sO if k == "sumOff" else sD if k == "sumDef" else np.array([r[k] or 0.0 for r in rows]) for k in keys]
        return np.column_stack([np.ones(len(rows))] + cols)
    Ao = design(["sumOff"] + (extra_off or []))
    Ad = design(["sumDef"] + (extra_def or []))
    for f in folds:
        te = np.isin(YR, f); tr = ~te
        wo = np.linalg.lstsq(Ao[tr], oR[tr], rcond=None)[0]; po = Ao @ wo
        wd = np.linalg.lstsq(Ad[tr], dR[tr], rcond=None)[0]; pd_ = Ad @ wd
        wp = po[te]**bestk/(po[te]**bestk+pd_[te]**bestk)
        errs += list(82*wp - T[te])
    return math.sqrt(np.mean(np.array(errs)**2))

cv_base = cv_wins()
cv_base_actual = cv_wins(target=W)
print(f"\n=== honest out-of-sample accuracy (year-grouped 10-fold CV) ===")
print(f"  core (ΣOBPM/ΣDBPM) vs pythag-wins target: RMSE={cv_base:.3f}")
print(f"  core (ΣOBPM/ΣDBPM) vs ACTUAL wins:        RMSE={cv_base_actual:.3f}  (includes ~2.4 wins of close-game luck)")
# diagnostic: do TOV/ORB (ORtg) and DRB (DRtg) improve held-out accuracy? (spoiler: no -- they're in BPM already)
have_box = [r for r in rows if r["sumTov"] is not None and r["sumOrb"] is not None and r["sumDrb"] is not None]
cv_box = None
if len(have_box) > 800:
    cv_box = cv_wins(extra_off=["sumTov", "sumOrb"], extra_def=["sumDrb"])
    print(f"  + TOV+ORB (off), DRB (def):    RMSE={cv_box:.3f}  (delta {cv_box-cv_base:+.3f}; kept only if <= -0.02)")
    keep_box = (cv_base - cv_box) >= 0.02
else:
    keep_box = False
print(f"  -> box-rate team terms {'KEPT' if keep_box else 'REJECTED (stay 0; rebounding handled as fantasy-regime deficit penalty)'}")

coeff = {
  "ortgBase": round(ortgBase, 3), "drtgBase": round(drtgBase, 3),
  "offScale": round(offScale, 4), "defScale": round(defScale, 4), "pythK": bestk,
  "zCap": ZCAP,
  # era-depth multiplier: 1.0 for year>=fullYear (modern calibration era), ramps down to `floor` by startYear.
  # REASONED (not fitted): discounts thin/shallow early-league dominance. See DESIGN.md.
  "eraStrength": {"floor": 0.85, "gamma": 0.7, "startYear": 1950, "fullYear": 1985},
  "offModel": {k: round(v, 4) for k, v in offModel.items()},
  "defModel": {k: round(v, 4) for k, v in defModel.items()},          # legacy (reporting only)
  "defModelEst": {k: round(v, 4) for k, v in defModelEst.items()},    # engine pre-1974 defense path
  "defEstCap": DEF_EST_CAP, "dwsShrinkK": DWS_SHRINK_K, "leagueDwsMean": round(LEAGUE_DWS_MEAN, 5),
  "usgModel": {k: round(v, 4) for k, v in usgModel.items()},
  # budget 110 (was 100): median real top-5 sumUSG is 107.5, so the old budget penalized 91.7% of
  # real teams -- see USAGE_BUDGET comment at top. The penalty now fires only on genuine stacks.
  "usageBudget": USAGE_BUDGET, "overloadGamma": round(gamma, 3),
  "spacing": {"perShooter": round(per_shooter_fit, 3), "diminish": 0.55, "noneFloor": -3.0, "baseline": 1.6},
  # continuous rim protection: best big's blk z maps 0..1 over [blkLo, blkLo+blkSpan]; penalty = noRimPenalty*(1-rimScore)
  "rim": {"blkLo": 0.4, "blkSpan": 1.4, "trbProxyLo": 0.8, "trbProxySpan": 1.6},
  # interior-presence penalty (no real big -> concedes rim+post+glass). CV-safe: every real top-5 has a big.
  # A DRB-rate penalty was tested and DROPPED: it cannot separate all-guard fantasy lineups from real
  # small-ball teams (both have meanTrbZ ~0; see the DRB CV diagnostic above), so size is carried here.
  "noRimPenalty": 7.0, "thinPerimeterPenalty": 3.0,
  "_meta": {"team_seasons": len(rows), "off_r2": round(r2o, 3), "def_r2": round(r2d, 3),
            # cv_wins_rmse measures against the LUCK-FREE pythag-wins target (k=PYTH_TARGET_K);
            # cv_wins_rmse_vs_actual is the same model vs raw season wins (incl. close-game luck).
            "cv_target": f"pythag_wins(k={PYTH_TARGET_K:g})",
            "in_sample_wins_rmse": round(beste, 2), "cv_wins_rmse": round(cv_base, 3),
            "cv_wins_rmse_vs_actual": round(cv_base_actual, 3),
            "cv_wins_rmse_with_box": round(cv_box, 3) if cv_box is not None else None,
            "zoff_r2": round(offR2, 3), "zdef_r2_legacy": round(defR2, 3), "zdef_r2_est": round(defEstR2, 3),
            "zusg_r2": round(usgR2, 3), "gamma_fit": round(gamma_fit, 4), "spacing_fit": round(per_shooter_fit, 3),
            "box_team_terms_help_cv": bool(keep_box)}
}
json.dump(clean(coeff), open("web/public/data/coefficients.json", "w", encoding="utf-8"), indent=2, allow_nan=False)
print("\nwrote web/public/data/coefficients.json")
print(json.dumps(clean(coeff["_meta"]), indent=0))
