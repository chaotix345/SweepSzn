"""
Calibrate engine coefficients against real team-seasons.

For each real team (BPM era), take its top-5-by-minutes, sum OBPM and DBPM, and regress
those against the team's ACTUAL ORtg / DRtg / wins. This fits the engine's scales, bases,
and Pythagorean exponent to reality instead of hand-guessed constants.
Outputs web/public/data/coefficients.json + prints a calibration table.
"""
import json, sys, math
import numpy as np
sys.stdout.reconfigure(encoding="utf-8")

team_seasons = json.load(open("data/out/team_seasons.json", encoding="utf-8"))
rot = json.load(open("data/out/team_rotations.json", encoding="utf-8"))["team_rotations"]

# B-R full-name -> abbreviation (modern era; includes renames/relocations 1985-2025)
NAME2ABBR = {
 "Atlanta Hawks":"ATL","Boston Celtics":"BOS","Chicago Bulls":"CHI","Cleveland Cavaliers":"CLE",
 "Dallas Mavericks":"DAL","Denver Nuggets":"DEN","Detroit Pistons":"DET","Golden State Warriors":"GSW",
 "Houston Rockets":"HOU","Indiana Pacers":"IND","Los Angeles Clippers":"LAC","Los Angeles Lakers":"LAL",
 "Miami Heat":"MIA","Milwaukee Bucks":"MIL","Minnesota Timberwolves":"MIN","New York Knicks":"NYK",
 "Orlando Magic":"ORL","Philadelphia 76ers":"PHI","Phoenix Suns":"PHO","Portland Trail Blazers":"POR",
 "Sacramento Kings":"SAC","San Antonio Spurs":"SAS","Toronto Raptors":"TOR","Utah Jazz":"UTA",
 "Washington Wizards":"WAS","Washington Bullets":"WSB","Memphis Grizzlies":"MEM","Vancouver Grizzlies":"VAN",
 "New Jersey Nets":"NJN","Brooklyn Nets":"BRK","Charlotte Hornets":"CHO","Charlotte Bobcats":"CHA",
 "New Orleans Hornets":"NOH","New Orleans/Oklahoma City Hornets":"NOK","New Orleans Pelicans":"NOP",
 "Oklahoma City Thunder":"OKC","Seattle SuperSonics":"SEA","Kansas City Kings":"KCK",
 "Washington Bullets":"WSB","San Diego Clippers":"SDC",
}
# Charlotte Hornets used CHH 1989-2002 then CHO from 2015; map by year below.
def abbr_for(name, year):
    if name == "Charlotte Hornets":
        return "CHH" if year <= 2002 else "CHO"
    return NAME2ABBR.get(name)

rows = []
unmatched = set()
for ts in team_seasons:
    y, name = ts["year"], ts["team_name"]
    if y < 1985: continue  # OBPM/DBPM exist 1974+, but keep the rich, name-stable modern era
    if ts.get("ortg") is None or ts.get("drtg") is None or ts.get("w") is None: continue
    ab = abbr_for(name, y)
    if not ab:
        unmatched.add(name); continue
    players = rot.get(f"{y}|{ab}")
    if not players:
        unmatched.add(f"{y} {name} [{ab}]"); continue
    top5 = players[:5]
    if len(top5) < 5: continue
    if any(p.get("obpm") is None or p.get("dbpm") is None for p in top5): continue
    l = ts.get("l")
    if not l or (ts["w"] + l) == 0: continue
    sumOff = sum(p["obpm"] for p in top5)
    sumDef = sum(p["dbpm"] for p in top5)
    wpct = ts["w"] / (ts["w"] + l)            # season-length independent (handles 1999/2020)
    rows.append({"year": y, "name": name, "sumOff": sumOff, "sumDef": sumDef,
                 "ortg": ts["ortg"], "drtg": ts["drtg"], "w82": 82 * wpct,
                 "nrtg": ts.get("nrtg")})

print(f"matched team-seasons: {len(rows)} | unmatched names: {len(unmatched)}")
if unmatched:
    print("  e.g.:", list(sorted(unmatched))[:12])
if len(rows) < 50:
    print("NOT ENOUGH DATA -- check name map / rotations"); sys.exit(1)

sumOff = np.array([r["sumOff"] for r in rows])
sumDef = np.array([r["sumDef"] for r in rows])
ortg = np.array([r["ortg"] for r in rows])
drtg = np.array([r["drtg"] for r in rows])
W = np.array([r["w82"] for r in rows], dtype=float)

def linfit(x, y):
    A = np.vstack([x, np.ones_like(x)]).T
    m, b = np.linalg.lstsq(A, y, rcond=None)[0]
    pred = m*x + b
    ss = 1 - np.sum((y-pred)**2)/np.sum((y-np.mean(y))**2)
    rmse = math.sqrt(np.mean((y-pred)**2))
    return m, b, ss, rmse

bo, ao, r2o, rmseo = linfit(sumOff, ortg)      # ortg = ao + bo*sumOff
md, ad, r2d, rmsed = linfit(sumDef, drtg)      # drtg = ad + md*sumDef (md<0)
offScale = bo; ortgBase = ao
defScale = -md; drtgBase = ad

print(f"\nOFFENSE: ortg = {ao:.2f} + {bo:.3f}*ΣOBPM   R2={r2o:.3f} RMSE={rmseo:.2f}")
print(f"DEFENSE: drtg = {ad:.2f} + {md:.3f}*ΣDBPM   R2={r2d:.3f} RMSE={rmsed:.2f}")

# predicted ortg/drtg for each team, then fit Pythagorean k against actual wins
pred_o = ao + bo*sumOff
pred_d = ad + md*sumDef
best_k, best_err = None, 1e9
for k in np.arange(8.0, 20.01, 0.25):
    wp = pred_o**k / (pred_o**k + pred_d**k)
    pw = 82*wp
    err = math.sqrt(np.mean((pw - W)**2))
    if err < best_err: best_err, best_k = err, k
# also report pure-Pythagorean k on ACTUAL ortg/drtg (the "true" NBA exponent)
bk2, be2 = None, 1e9
for k in np.arange(8.0, 20.01, 0.25):
    wp = ortg**k/(ortg**k+drtg**k); err = math.sqrt(np.mean((82*wp - W)**2))
    if err < be2: be2, bk2 = err, k
print(f"\nPythagorean k (end-to-end best): {best_k}  wins RMSE={best_err:.2f}")
print(f"Pythagorean k (on actual ORtg/DRtg): {bk2}  wins RMSE={be2:.2f}")

coeff = {
  "ortgBase": round(float(ortgBase),3), "drtgBase": round(float(drtgBase),3),
  "offScale": round(float(offScale),4), "defScale": round(float(defScale),4),
  "pythK": float(best_k),
  "preBpmOffScale": 1.6, "preBpmDefScale": 1.4,
  "offZ": {"pts":1.0,"ast":0.45,"ts":0.6,"tov":0.3},
  "defZ": {"stl":0.55,"blk":0.55,"drb":0.45,"trb":0.5},
  "rimPrior": {"C":1.1,"PF":0.5,"other":0.0},
  "usage": {"base":18,"pts":4.2,"ast":2.2,"cap":38,"floor":8},
  "usageBudget": 100, "overloadGamma": 0.22,
  "spacingByCount": [-3,-1,0,1.5,2.5,1.5], "noRimPenalty": 5.0, "thinPerimeterPenalty": 3.0,
  "_meta": {"matched_team_seasons": len(rows), "off_r2": round(r2o,3), "def_r2": round(r2d,3),
            "wins_rmse": round(best_err,2)}
}
json.dump(coeff, open("web/public/data/coefficients.json","w",encoding="utf-8"), indent=2)
print("\nwrote web/public/data/coefficients.json")

# calibration table: predicted vs actual wins for some famous teams + worst misses
def pred_wins(r):
    o = ortgBase + offScale*r["sumOff"]; d = drtgBase - defScale*r["sumDef"]
    return 82*o**best_k/(o**best_k+d**best_k)
famous = [(1996,"Chicago Bulls"),(2016,"Golden State Warriors"),(2017,"Golden State Warriors"),
          (1986,"Boston Celtics"),(2008,"Boston Celtics"),(1996,"Seattle SuperSonics"),
          (2019,"Milwaukee Bucks"),(2013,"Miami Heat")]
idx = {(r["year"],r["name"]): r for r in rows}
print("\nFAMOUS TEAMS  pred vs actual wins:")
for key in famous:
    r = idx.get(key)
    if r: print(f"  {key[0]} {key[1]:24s} pred {pred_wins(r):4.0f}  actual {r['w82']:.0f}")
errs = sorted(rows, key=lambda r: -abs(pred_wins(r)-r["w82"]))[:6]
print("\nWORST MISSES:")
for r in errs:
    print(f"  {r['year']} {r['name']:24s} pred {pred_wins(r):4.0f}  actual {r['w82']:.0f}")
