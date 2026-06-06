import fs from "node:fs";
import path from "node:path";
import { evaluateLineup, quickScore, playerFeatures, DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients } from "../lib/types";

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const c: Coefficients = { ...DEFAULT_COEFFICIENTS, ...JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8")) };

const feat = players.map((p) => ({ p, ...playerFeatures(p, c) }));
const base = (f: typeof feat[number]) => c.offScale * f.off + c.defScale * f.def;

// lean inline scorer over precomputed features (exact same math as the engine)
function score(idx: number[]): number {
  let sO = 0, sD = 0, tU = 0, sh = 0, perim = 0, rim = false, modern = false;
  for (const i of idx) {
    const f = pool[i];
    sO += f.off; sD += f.def; tU += f.usage; sh += f.shoot;
    if (f.rim) rim = true; if (f.perim) perim++; if (f.modern) modern = true;
  }
  const overload = c.overloadGamma * Math.max(0, tU - c.usageBudget);
  const eff = sh <= 3 ? sh : 3 + (sh - 3) * c.spacing.diminish;
  const spacing = modern ? Math.max(c.spacing.noneFloor, Math.min(3, c.spacing.perShooter * (eff - c.spacing.baseline))) : 0;
  const ortg = c.ortgBase + c.offScale * sO + spacing - overload;
  const drtg = c.drtgBase - c.defScale * sD + (rim ? 0 : c.noRimPenalty) + (perim >= 1 ? 0 : c.thinPerimeterPenalty);
  const k = c.pythK;
  const oP = ortg ** k, dP = drtg ** k;
  return oP / (oP + dP); // winPct (continuous, breaks the integer-win ties)
}

// ---- brute force over the strongest N by base value ----
const N = 60;
const pool = [...feat].sort((a, b) => base(b) - base(a)).slice(0, N);
console.log(`brute-forcing C(${N},5) = ${(N*(N-1)*(N-2)*(N-3)*(N-4)/120).toLocaleString()} combos...`);
type Cand = { wp: number; idx: number[] };
const top: Cand[] = [];
let bf: Cand = { wp: -1, idx: [] };
for (let a = 0; a < N; a++)
 for (let b = a + 1; b < N; b++)
  for (let d = b + 1; d < N; d++)
   for (let e = d + 1; e < N; e++)
    for (let g = e + 1; g < N; g++) {
      const idx = [a, b, d, e, g];
      const wp = score(idx);
      if (wp > bf.wp) bf = { wp, idx };
      if (top.length < 12 || wp > top[top.length - 1].wp) {
        top.push({ wp, idx });
        top.sort((x, y) => y.wp - x.wp);
        if (top.length > 12) top.pop();
      }
    }

// ---- full-pool hill-climb (can reach ANY of the 2,282 players) to confirm global optimum ----
function rng(s: number) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(99);
// score across the full player set (hill-climb can reach any of the 2,282)
function scoreGlobal(gIdx: number[]): number {
  let sO = 0, sD = 0, tU = 0, sh = 0, perim = 0, rim = false, modern = false;
  for (const i of gIdx) { const f = feat[i]; sO += f.off; sD += f.def; tU += f.usage; sh += f.shoot; if (f.rim) rim = true; if (f.perim) perim++; if (f.modern) modern = true; }
  const overload = c.overloadGamma * Math.max(0, tU - c.usageBudget);
  const eff = sh <= 3 ? sh : 3 + (sh - 3) * c.spacing.diminish;
  const spacing = modern ? Math.max(c.spacing.noneFloor, Math.min(3, c.spacing.perShooter * (eff - c.spacing.baseline))) : 0;
  const ortg = c.ortgBase + c.offScale * sO + spacing - overload;
  const drtg = c.drtgBase - c.defScale * sD + (rim ? 0 : c.noRimPenalty) + (perim >= 1 ? 0 : c.thinPerimeterPenalty);
  const oP = ortg ** c.pythK, dP = drtg ** c.pythK; return oP / (oP + dP);
}
const NF = feat.length;
let hc = { wp: -1, idx: [] as number[] };
for (let start = 0; start < 150; start++) {
  const cur: number[] = []; const used = new Set<number>();
  while (cur.length < 5) { const k = Math.floor(rand() * NF); if (!used.has(k)) { used.add(k); cur.push(k); } }
  let curWp = scoreGlobal(cur);
  let improved = true;
  while (improved) {
    improved = false;
    for (let s = 0; s < 5; s++) for (let cand = 0; cand < NF; cand++) {
      if (cur.includes(cand)) continue;
      const trial = cur.slice(); trial[s] = cand;
      const wp = scoreGlobal(trial);
      if (wp > curWp) { cur[s] = cand; curWp = wp; improved = true; }
    }
  }
  if (curWp > hc.wp) hc = { wp: curWp, idx: cur.slice() };
}

// ---- reconcile + authoritative re-score with the real engine ----
const bfTeam = bf.idx.map((i) => pool[i].p);
const hcTeam = hc.idx.map((i) => feat[i].p);
const winner = hc.wp > bf.wp ? hcTeam : bfTeam;
console.log(`brute-force best winPct=${bf.wp.toFixed(4)} | hill-climb best winPct=${hc.wp.toFixed(4)} | agree=${Math.abs(hc.wp - bf.wp) < 1e-4}`);

const R = evaluateLineup(winner, c);
console.log(`\n================ BEST TEAM OF ALL TIME (per engine) ================`);
console.log(`RECORD: ${R.wins}-${R.losses}   ${R.label}   (ORtg ${R.ortg} / DRtg ${R.drtg} / Net ${R.netRtg > 0 ? "+" : ""}${R.netRtg}, win% ${(R.winPct*100).toFixed(1)})`);
console.log("LINEUP:");
for (const p of winner) {
  const im = R.players.find((x) => x.id === p.id)!;
  console.log(`  ${p.pos.padEnd(2)} ${p.name.padEnd(22)} ${p.year} ${p.team.padEnd(4)}  off ${im.off.toFixed(1).padStart(5)}  def ${im.def.toFixed(1).padStart(5)}  usg ${String(im.usage).padStart(2)}  ${p.tier !== "complete" ? "(est.D)" : ""}`);
}
console.log("FACTORS:");
for (const f of R.factors) console.log(`  ${f.value > 0 ? "+" : ""}${f.value}  ${f.label}`);

console.log(`\n--- top 10 teams by win% (brute force pool) ---`);
top.slice(0, 10).forEach((t, i) => {
  const names = t.idx.map((x) => pool[x].p.name.split(" ").slice(-1)[0]).join("/");
  const r = quickScore(t.idx.map((x) => pool[x].p), c);
  console.log(`  ${String(i + 1).padStart(2)}. ${r.wins}-${82 - r.wins}  (net ${r.netRtg.toFixed(1)})  ${names}`);
});
