import fs from "node:fs";
import path from "node:path";
import { evaluateLineup, playerFeatures, DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients } from "../lib/types";

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const c: Coefficients = { ...DEFAULT_COEFFICIENTS, ...JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8")) };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ban the obvious all-time household names so the result is a genuine "sleeper"
const BANNED = `michael jordan,lebron,stephen curry,kareem,magic johnson,larry bird,tim duncan,hakeem,shaquille,
bill russell,wilt chamberlain,nikola jokic,giannis,kevin durant,kobe,oscar robertson,jerry west,kevin garnett,
david robinson,luka,gilgeous,james harden,russell westbrook,steve nash,john stockton,karl malone,dirk,scottie pippen,
chris paul,dwyane wade,joel embiid,anthony davis,kawhi leonard,allen iverson,charles barkley,patrick ewing,
reggie miller,ray allen,dennis rodman,gary payton,isiah thomas,clyde drexler,george mikan,elgin baylor,julius erving,
moses malone,wembanyama,damian lillard,carmelo,vince carter,paul george,jimmy butler,kyrie,klay thompson,draymond,
ja morant,jayson tatum,anthony edwards,devin booker,trae young,tracy mcgrady,grant hill,penny hardaway,dominique`
  .split(",").map((s) => norm(s.trim())).filter(Boolean);

const eligible = players.filter((p) => !BANNED.some((b) => norm(p.name).includes(b)));
const feat = eligible.map((p) => ({ p, ...playerFeatures(p, c) }));
const NF = feat.length;
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
const rand = rng(2026);
let best = { wp: -1, idx: [] as number[] };
for (let start = 0; start < 250; start++) {
  const cur: number[] = []; const used = new Set<number>();
  while (cur.length < 5) { const k = Math.floor(rand() * NF); if (!used.has(k)) { used.add(k); cur.push(k); } }
  let wp = scoreG(cur), improved = true;
  while (improved) {
    improved = false;
    for (let s = 0; s < 5; s++) for (let cand = 0; cand < NF; cand++) {
      if (cur.includes(cand)) continue;
      const t = cur.slice(); t[s] = cand; const w = scoreG(t);
      if (w > wp) { cur[s] = cand; wp = w; improved = true; }
    }
  }
  if (wp > best.wp) best = { wp, idx: cur.slice() };
}
const team = best.idx.map((i) => feat[i].p);
const R = evaluateLineup(team, c);
console.log(`\nSLEEPER TEAM:  ${R.wins}-${R.losses}  ${R.label}   ORtg ${R.ortg}/DRtg ${R.drtg}/Net ${R.netRtg > 0 ? "+" : ""}${R.netRtg}  (win% ${(R.winPct * 100).toFixed(1)})`);
for (const p of team) {
  const im = R.players.find((x) => x.id === p.id)!;
  console.log(`  ${p.pos.padEnd(2)} ${p.name.padEnd(22)} ${p.year} ${(p.team || "").padEnd(4)}  off ${im.off.toFixed(1).padStart(5)}  def ${im.def.toFixed(1).padStart(5)}  usg ${String(im.usage).padStart(2)}  ${p.tier !== "complete" ? "(est.D)" : ""}`);
}
console.log("why:");
for (const f of R.factors) console.log(`  ${f.value > 0 ? "+" : ""}${f.value}  ${f.label}`);
