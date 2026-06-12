import fs from "node:fs";
import path from "node:path";
import { evaluateLineup, quickScore, playerFeatures, DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients, Slot } from "../lib/types";

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const c: Coefficients = { ...DEFAULT_COEFFICIENTS, ...JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8")) };

const feat = players.map((p) => ({ p, person: p.person_id ?? p.name, ...playerFeatures(p, c) }));
type F = (typeof feat)[number];
const base = (f: F) => c.offScale * f.off + c.defScale * f.def;

// Lean inline scorer over precomputed features. MUST mirror lib/engine.ts lineupTerms exactly:
// continuous interior presence (max rimScore), continuous perimeter credit (summed perimScore).
// playerFeatures exports both so this cannot silently drift from the engine again.
function wpOf(fs: F[]): number {
  let sO = 0, sD = 0, tU = 0, sh = 0, perimScore = 0, rim = 0;
  let modern = false;
  for (const f of fs) {
    sO += f.off; sD += f.def; tU += f.usage; sh += f.shoot;
    rim = Math.max(rim, f.rimScore); perimScore += f.perimScore;
    if (f.modern) modern = true;
  }
  const overload = c.overloadGamma * Math.max(0, tU - c.usageBudget);
  const eff = sh <= 3 ? sh : 3 + (sh - 3) * c.spacing.diminish;
  const spacing = modern ? Math.max(c.spacing.noneFloor, Math.min(3, c.spacing.perShooter * (eff - c.spacing.baseline))) : 0;
  const ortg = c.ortgBase + c.offScale * sO + spacing - overload;
  const drtg = c.drtgBase - c.defScale * sD + c.noRimPenalty * (1 - rim) + c.thinPerimeterPenalty * Math.max(0, Math.min(1, 1 - perimScore));
  const oP = Math.max(1, ortg) ** c.pythK, dP = Math.max(1, drtg) ** c.pythK;
  return oP / (oP + dP); // winPct (continuous, breaks the integer-win ties)
}

// the game locks out other variants of a drafted person — the search must too (no Stockton x2)
const distinctPersons = (fs: F[]) => new Set(fs.map((f) => f.person)).size === fs.length;

// ---- brute force over the strongest N by base value ----
const N = 60;
const pool = [...feat].sort((a, b) => base(b) - base(a)).slice(0, N);
console.log(`brute-forcing C(${N},5) = ${(N * (N - 1) * (N - 2) * (N - 3) * (N - 4) / 120).toLocaleString()} combos (person-deduped)...`);
type Cand = { wp: number; idx: number[] };
const top: Cand[] = [];
let bf: Cand = { wp: -1, idx: [] };
for (let a = 0; a < N; a++)
 for (let b = a + 1; b < N; b++)
  for (let d = b + 1; d < N; d++)
   for (let e = d + 1; e < N; e++)
    for (let g = e + 1; g < N; g++) {
      const idx = [a, b, d, e, g];
      const fs = idx.map((i) => pool[i]);
      if (!distinctPersons(fs)) continue;
      const wp = wpOf(fs);
      if (wp > bf.wp) bf = { wp, idx };
      if (top.length < 12 || wp > top[top.length - 1].wp) {
        top.push({ wp, idx });
        top.sort((x, y) => y.wp - x.wp);
        if (top.length > 12) top.pop();
      }
    }

// ---- full-pool hill-climb (can reach ANY player) to confirm the global optimum ----
function rng(s: number) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(99);
const NF = feat.length;
let hc = { wp: -1, idx: [] as number[] };
for (let start = 0; start < 150; start++) {
  const cur: number[] = []; const used = new Set<string>();
  while (cur.length < 5) {
    const k = Math.floor(rand() * NF);
    if (!cur.includes(k) && !used.has(feat[k].person)) { used.add(feat[k].person); cur.push(k); }
  }
  let curWp = wpOf(cur.map((i) => feat[i]));
  let improved = true;
  while (improved) {
    improved = false;
    for (let s = 0; s < 5; s++) for (let cand = 0; cand < NF; cand++) {
      if (cur.includes(cand)) continue;
      const others = cur.filter((_, j) => j !== s);
      if (others.some((o) => feat[o].person === feat[cand].person)) continue;
      const trial = cur.slice(); trial[s] = cand;
      const wp = wpOf(trial.map((i) => feat[i]));
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
console.log(`RECORD: ${R.wins}-${R.losses}   ${R.label}   (ORtg ${R.ortg} / DRtg ${R.drtg} / Net ${R.netRtg > 0 ? "+" : ""}${R.netRtg}, win% ${(R.winPct * 100).toFixed(1)})`);
const sanity = Math.abs(R.winPct - Math.max(bf.wp, hc.wp));
console.log(`lean-scorer vs engine winPct drift: ${sanity.toFixed(5)} ${sanity < 1e-3 ? "(exact)" : "(DRIFT — fix wpOf!)"}`);
console.log("LINEUP:");
for (const p of winner) {
  const im = R.players.find((x) => x.id === p.id)!;
  console.log(`  ${p.pos.padEnd(2)} ${p.name.padEnd(22)} ${p.year} ${p.team.padEnd(4)}  off ${im.off.toFixed(1).padStart(5)}  def ${im.def.toFixed(1).padStart(5)}  usg ${String(im.usage).padStart(2)}  ${p.tier !== "complete" ? "(est.D)" : ""}`);
}
console.log("FACTORS:");
for (const f of R.factors) console.log(`  ${f.value > 0 ? "+" : ""}${f.value}  ${f.label}${f.winsEst != null ? `  (~${f.winsEst > 0 ? "+" : ""}${f.winsEst} wins)` : ""}`);

console.log(`\n--- top 10 teams by win% (brute force pool, person-deduped) ---`);
top.slice(0, 10).forEach((t, i) => {
  const names = t.idx.map((x) => pool[x].p.name.split(" ").slice(-1)[0]).join("/");
  const r = quickScore(t.idx.map((x) => pool[x].p), c);
  console.log(`  ${String(i + 1).padStart(2)}. ${r.wins}-${82 - r.wins}  (net ${r.netRtg.toFixed(1)})  ${names}`);
});

// ════════════════ DRAFTABLE best (the lineup a player can actually build) ════════════════
// The engine optimum above ignores the game's slot rule: one player per PG/SG/SF/PF/C slot,
// constrained by each card's `eligible` array. Two C-only bigs (Jokić + Wilt) are engine-legal
// but game-illegal. This section finds the best five that admits a perfect slot assignment.

const SLOTS5: Slot[] = ["PG", "SG", "SF", "PF", "C"];
const eligOf = (p: Player): Slot[] => (p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot]);
const maskOf = (p: Player) => eligOf(p).reduce((m, s) => m | (1 << SLOTS5.indexOf(s)), 0);
const masks = feat.map((f) => maskOf(f.p));

// 5x5 bipartite perfect matching (DFS augmenting — tiny, exact)
function slotAssign(ms: number[]): number[] | null {
  const slotOf = new Array<number>(5).fill(-1); // slot -> player index (into ms)
  const tryP = (pi: number, seen: boolean[]): boolean => {
    for (let s = 0; s < 5; s++) {
      if (!((ms[pi] >> s) & 1) || seen[s]) continue;
      seen[s] = true;
      if (slotOf[s] === -1 || tryP(slotOf[s], seen)) { slotOf[s] = pi; return true; }
    }
    return false;
  };
  for (let pi = 0; pi < 5; pi++) if (!tryP(pi, new Array(5).fill(false))) return null;
  return slotOf;
}
const isDraftable = (gIdx: number[]) => slotAssign(gIdx.map((i) => masks[i])) !== null;

// ---- brute force over the strongest NL by base value, legality-gated ----
const NL = 80;
const lpool = [...feat.keys()].sort((a, b) => base(feat[b]) - base(feat[a])).slice(0, NL);
console.log(`\nbrute-forcing C(${NL},5) draftable combos...`);
let lbf: Cand = { wp: -1, idx: [] };
const ltop: Cand[] = [];
for (let a = 0; a < NL; a++)
 for (let b = a + 1; b < NL; b++)
  for (let d = b + 1; d < NL; d++)
   for (let e = d + 1; e < NL; e++)
    for (let g = e + 1; g < NL; g++) {
      const gIdx = [lpool[a], lpool[b], lpool[d], lpool[e], lpool[g]];
      const fs5 = gIdx.map((i) => feat[i]);
      if (!distinctPersons(fs5)) continue;
      // cheap prefilter: the five's eligibility union must cover all slots
      if ((masks[gIdx[0]] | masks[gIdx[1]] | masks[gIdx[2]] | masks[gIdx[3]] | masks[gIdx[4]]) !== 31) continue;
      const wp = wpOf(fs5);
      if (wp <= (ltop.length === 12 ? ltop[11].wp : -1) && wp <= lbf.wp) continue;
      if (!isDraftable(gIdx)) continue; // exact matching only for contenders
      if (wp > lbf.wp) lbf = { wp, idx: gIdx };
      ltop.push({ wp, idx: gIdx });
      ltop.sort((x, y) => y.wp - x.wp);
      if (ltop.length > 12) ltop.pop();
    }

// ---- slot-keyed hill-climb over the FULL pool (legal by construction) ----
const bySlot: number[][] = SLOTS5.map((_, s) => [...feat.keys()].filter((i) => (masks[i] >> s) & 1));
let lhc = { wp: -1, idx: [] as number[] };
for (let start = 0; start < 200; start++) {
  const cur: number[] = []; const used = new Set<string>();
  for (let s = 0; s < 5; s++) {
    let k: number;
    do { k = bySlot[s][Math.floor(rand() * bySlot[s].length)]; } while (used.has(feat[k].person));
    used.add(feat[k].person); cur.push(k);
  }
  let curWp = wpOf(cur.map((i) => feat[i]));
  let improved = true;
  while (improved) {
    improved = false;
    for (let s = 0; s < 5; s++) for (const cand of bySlot[s]) {
      if (cur.includes(cand)) continue;
      if (cur.some((o, j) => j !== s && feat[o].person === feat[cand].person)) continue;
      const trial = cur.slice(); trial[s] = cand;
      const wp = wpOf(trial.map((i) => feat[i]));
      if (wp > curWp) { cur[s] = cand; curWp = wp; improved = true; }
    }
  }
  if (curWp > lhc.wp) lhc = { wp: curWp, idx: cur.slice() };
}

const legalIdx = lhc.wp > lbf.wp ? lhc.idx : lbf.idx;
const legalTeam = legalIdx.map((i) => feat[i].p);
console.log(`draftable: brute-force winPct=${lbf.wp.toFixed(4)} | slot hill-climb winPct=${lhc.wp.toFixed(4)} | agree=${Math.abs(lhc.wp - lbf.wp) < 1e-4}`);

const assign = slotAssign(legalIdx.map((i) => masks[i]))!;
const RL = evaluateLineup(legalTeam, c);
console.log(`\n================ BEST DRAFTABLE TEAM (slot-legal) ================`);
console.log(`RECORD: ${RL.wins}-${RL.losses}   ${RL.grade} ${RL.label}   (ORtg ${RL.ortg} / DRtg ${RL.drtg} / Net ${RL.netRtg > 0 ? "+" : ""}${RL.netRtg}, win% ${(RL.winPct * 100).toFixed(1)})`);
console.log("LINEUP (assigned slot):");
for (let s = 0; s < 5; s++) {
  const p = feat[legalIdx[assign[s]]].p;
  const im = RL.players.find((x) => x.id === p.id)!;
  console.log(`  ${SLOTS5[s].padEnd(2)} ${p.name.padEnd(22)} ${p.year} ${p.team.padEnd(4)} elig[${eligOf(p).join(",")}]  off ${im.off.toFixed(1).padStart(5)}  def ${im.def.toFixed(1).padStart(5)}  usg ${Math.round(im.usage)}`);
}
console.log("FACTORS:");
for (const f of RL.factors) console.log(`  ${f.value > 0 ? "+" : ""}${f.value}  ${f.label}${f.winsEst != null ? `  (~${f.winsEst > 0 ? "+" : ""}${f.winsEst} wins)` : ""}`);

console.log(`\n--- top 10 DRAFTABLE teams (brute force pool) ---`);
ltop.slice(0, 10).forEach((t, i) => {
  const names = t.idx.map((x) => feat[x].p.name.split(" ").slice(-1)[0]).join("/");
  const r = quickScore(t.idx.map((x) => feat[x].p), c);
  console.log(`  ${String(i + 1).padStart(2)}. ${r.wins}-${82 - r.wins}  (net ${r.netRtg.toFixed(1)})  ${names}`);
});
