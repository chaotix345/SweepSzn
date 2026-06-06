"""
Enhanced calibration.
1) Fit z-score -> OBPM / DBPM / USG models on the 1974+ overlap, using ONLY the features
   available pre-1974 (pts/ast/ts for offense; trb+position for defense; pts/ast for usage),
   so old-era players get defensible BPM-equivalent ratings on the modern scale.
2) Fit team ORtg/DRtg from top-5 OBPM/DBPM (+ CV), fit usage-overload gamma from real-team
   residuals, fit Pythagorean k.
Writes web/public/data/coefficients.json.
"""
import json, sys, math
import numpy as np
sys.stdout.reconfigure(encoding="utf-8")

aps = json.load(open("data/out/all_player_seasons.json", encoding="utf-8"))
team_seasons = json.load(open("data/out/team_seasons.json", encoding="utf-8"))
rot = json.load(open("data/out/team_rotations.json", encoding="utf-8"))["team_rotations"]

def fit(X, y, names):
    X = np.asarray(X, float); y = np.asarray(y, float)
    A = np.hstack([np.ones((len(X), 1)), X])
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    pred = A @ coef
    r2 = 1 - np.sum((y - pred) ** 2) / np.sum((y - np.mean(y)) ** 2)
    rmse = math.sqrt(np.mean((y - pred) ** 2))
    return {"intercept": float(coef[0]), **{n: float(coef[i + 1]) for i, n in enumerate(names)}}, r2, rmse

def zget(p, k):
    z = p.get("z") or {}
    v = z.get(k)
    return None if v is None else float(v)

# ---------- 1) z -> impact models on the 1974+ overlap ----------
print("=== z -> impact fallback models (fit on 1974+, features available pre-1974) ===")
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

# DEFENSE: DBPM ~ z_trb + position dummies (PG reference)
POS = ["C", "PF", "SF", "SG"]
def pos_oh(pos):
    pos = {"F": "SF", "G": "SG"}.get(pos, pos)
    return [1.0 if pos == q else 0.0 for q in POS]
Xd, yd = [], []
for p in aps:
    if p["tier"] != "complete" or p.get("dbpm") is None: continue
    zt = zget(p, "trb"); g = p.get("g"); dws = p.get("dws")
    if zt is None or not g or dws is None: continue
    dwsr = dws / g  # defensive win shares per game (available pre-1974, uses team-defense context)
    Xd.append([dwsr, zt] + pos_oh(p["pos"])); yd.append(p["dbpm"])
defModel, defR2, defRMSE = fit(Xd, yd, ["dws", "trb"] + ["pos" + q for q in POS])
print(f"DBPM ~ dws+trb+pos  n={len(yd)}  R2={defR2:.3f} RMSE={defRMSE:.2f}")
print("  ", {k: round(v, 3) for k, v in defModel.items()})

# USAGE: USG ~ z_pts, z_ast  (fit on 1978+ where usg exists)
Xu, yu = [], []
for p in aps:
    if p.get("usg") is None: continue
    zp, za = zget(p, "pts"), zget(p, "ast")
    if None in (zp, za): continue
    Xu.append([zp, za]); yu.append(p["usg"])
usgModel, usgR2, usgRMSE = fit(Xu, yu, ["pts", "ast"])
print(f"USG ~ pts/ast       n={len(yu)}  R2={usgR2:.3f} RMSE={usgRMSE:.2f}")
print("  ", {k: round(v, 3) for k, v in usgModel.items()})

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
    sumUsg = sum(usgs) if len(usgs) == 5 else None
    rows.append({"sumOff": sumOff, "sumDef": sumDef, "ortg": ts["ortg"], "drtg": ts["drtg"],
                 "w82": 82 * ts["w"]/(ts["w"]+l), "sumUsg": sumUsg})

print(f"\n=== team calibration (n={len(rows)} team-seasons) ===")
sO = np.array([r["sumOff"] for r in rows]); sD = np.array([r["sumDef"] for r in rows])
oR = np.array([r["ortg"] for r in rows]); dR = np.array([r["drtg"] for r in rows])
W = np.array([r["w82"] for r in rows])

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

# ---- fit usage-overload gamma from ORtg residuals ----
have_usg = [r for r in rows if r["sumUsg"] is not None]
res = np.array([r["ortg"] - (ortgBase + offScale*r["sumOff"]) for r in have_usg])
over = np.array([max(0.0, r["sumUsg"] - 100.0) for r in have_usg])
if over.std() > 0:
    A = np.vstack([over, np.ones_like(over)]).T
    slope, icpt = np.linalg.lstsq(A, res, rcond=None)[0]
    gamma_fit = -float(slope)
else:
    gamma_fit = None
print(f"\nusage-overload fit: ORtg_resid ~ slope*max(0,ΣUSG-100); slope={slope:.4f} -> gamma_fit={gamma_fit:.4f}")
print(f"  (real-team ΣUSG range: {min(r['sumUsg'] for r in have_usg):.0f}..{max(r['sumUsg'] for r in have_usg):.0f}; n={len(have_usg)})")
# HONEST NOTE: gamma_fit<=0 -- real teams never stack 5 ball-dominant stars, so within the
# observed range usage concentration does NOT hurt offense and the data cannot fit a penalty.
# The usage-overload term is therefore a documented FANTASY-REGIME heuristic grounded in the
# finite-ball / usage-curve literature (you can't have five 30%-usage stars on one ball),
# applied only when a lineup's demanded usage far exceeds the 100% a real five shares.
gamma = 0.20
print(f"  -> using overloadGamma={gamma:.3f} (heuristic; data cannot calibrate this regime)")

# ---- fit Pythagorean k (end-to-end, on predicted ortg/drtg) ----
pO = ortgBase + offScale*sO; pD = drtgBase - defScale*sD
bestk, beste = 14.0, 1e9
for k in np.arange(8, 20.01, 0.25):
    wp = pO**k/(pO**k+pD**k); e = math.sqrt(np.mean((82*wp - W)**2))
    if e < beste: beste, bestk = e, float(k)
print(f"\nPythagorean k={bestk}  end-to-end wins RMSE={beste:.2f}")

coeff = {
  "ortgBase": round(ortgBase,3), "drtgBase": round(drtgBase,3),
  "offScale": round(offScale,4), "defScale": round(defScale,4), "pythK": bestk,
  "offModel": {k: round(v,4) for k,v in offModel.items()},
  "defModel": {k: round(v,4) for k,v in defModel.items()},
  "usgModel": {k: round(v,4) for k,v in usgModel.items()},
  "usageBudget": 100, "overloadGamma": round(gamma,3),
  "spacing": {"perShooter": 1.4, "diminish": 0.55, "noneFloor": -3.0, "baseline": 1.6},
  "noRimPenalty": 5.0, "thinPerimeterPenalty": 3.0,
  "_meta": {"team_seasons": len(rows), "off_r2": round(r2o,3), "def_r2": round(r2d,3),
            "wins_rmse": round(beste,2), "zoff_r2": round(offR2,3), "zdef_r2": round(defR2,3),
            "zusg_r2": round(usgR2,3), "gamma_fit": round(gamma_fit,4) if gamma_fit else None}
}
json.dump(coeff, open("web/public/data/coefficients.json","w",encoding="utf-8"), indent=2)
print("\nwrote web/public/data/coefficients.json")
print(json.dumps(coeff["_meta"], indent=0))
