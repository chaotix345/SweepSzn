import fs from "node:fs";
import path from "node:path";
import { evaluateLineup, playerFeatures, DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients } from "../lib/types";

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const c: Coefficients = { ...DEFAULT_COEFFICIENTS, ...JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8")) };

const POS = ["PG", "SG", "SF", "PF", "C"] as const;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// unmistakably famous high-scoring stars a fan would expect to dominate
const FAMOUS = `allen iverson,russell westbrook,derrick rose,damian lillard,trae young,kyrie irving,
kobe bryant,tracy mcgrady,vince carter,dwyane wade,demar derozan,devin booker,james harden,
carmelo anthony,paul pierce,dominique wilkins,amar'e stoudemire,blake griffin,chris bosh,
lamarcus aldridge,demarcus cousins,karl-anthony towns,patrick ewing,alonzo mourning`
  .split(",").map((s) => norm(s.trim())).filter(Boolean);
const eligible = players.filter((p) =>
  (POS as readonly string[]).includes(p.pos) && FAMOUS.some((f) => norm(p.name).includes(f)));
const feat = eligible.map((p) => ({ p, ...playerFeatures(p, c) }));

const buckets: Record<string, number[]> = {};
for (const pos of POS) buckets[pos] = feat.map((_, i) => i).filter((i) => feat[i].p.pos === pos);
for (const pos of POS) console.error(`${pos}: ${buckets[pos].length} scorers (e.g. ${buckets[pos].slice(0, 3).map((i) => feat[i].p.name).join(", ")})`);

function scoreG(idx: number[]): number {
  let sO = 0, sD = 0, tU = 0, sh = 0, perim = 0, rim = false, modern = false;
  for (const i of idx) { const f = feat[i]; sO += f.off; sD += f.def; tU += f.usage; sh += f.shoot; if (f.rim) rim = true; if (f.perim) perim++; if (f.modern) modern = true; }
  const overload = c.overloadGamma * Math.max(0, tU - c.usageBudget);
  const eff = sh <= 3 ? sh : 3 + (sh - 3) * c.spacing.diminish;
  const spacing = modern ? Math.max(c.spacing.noneFloor, Math.min(3, c.spacing.perShooter * (eff - c.spacing.baseline))) : 0;
  const ortg = c.ortgBase + c.offScale * sO + spacing - overload;
  const drtg = c.drtgBase - c.defScale * sD + (rim ? 0 : c.noRimPenalty) + (perim >= 1 ? 0 : c.thinPerimeterPenalty);
  const oP = ortg ** c.pythK, dP = drtg ** c.pythK; return oP / (oP + dP);
}
function rng(s: number) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(13);
let worst = { wp: 2, idx: [] as number[] };
for (let start = 0; start < 400; start++) {
  const cur = POS.map((pos) => buckets[pos][Math.floor(rand() * buckets[pos].length)]);
  let wp = scoreG(cur), improved = true;
  while (improved) {
    improved = false;
    for (let s = 0; s < 5; s++) for (const cand of buckets[POS[s]]) {
      const t = cur.slice(); t[s] = cand; const w = scoreG(t);
      if (w < wp) { cur[s] = cand; wp = w; improved = true; }   // MINIMIZE
    }
  }
  if (wp < worst.wp) worst = { wp, idx: cur.slice() };
}
const team = POS.map((_, s) => feat[worst.idx[s]].p);
const R = evaluateLineup(team, c);
console.log(`\nLOOKS-GREAT-ISNT (legal 5, all 25+ PPG stars):  ${R.wins}-${R.losses}  ${R.label}   ORtg ${R.ortg}/DRtg ${R.drtg}/Net ${R.netRtg > 0 ? "+" : ""}${R.netRtg}  (win% ${(R.winPct * 100).toFixed(1)})`);
for (let s = 0; s < 5; s++) {
  const p = team[s], im = R.players.find((x) => x.id === p.id)!;
  console.log(`  ${POS[s].padEnd(2)} ${p.name.padEnd(22)} ${p.year} ${(p.team || "").padEnd(4)}  ${(p.pts ?? 0).toFixed(1)} ppg  off ${im.off.toFixed(1).padStart(5)}  def ${im.def.toFixed(1).padStart(5)}  usg ${String(im.usage).padStart(2)}`);
}
console.log("why:");
for (const f of R.factors) console.log(`  ${f.value > 0 ? "+" : ""}${f.value}  ${f.label}`);
