import fs from "node:fs";
import path from "node:path";
import { evaluateLineup, DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients } from "../lib/types";

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const coeff: Coefficients = { ...DEFAULT_COEFFICIENTS, ...JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8")) };

const find = (q: string): Player => {
  const p = players.find((x) => x.name === q) || players.find((x) => x.name.includes(q));
  if (!p) throw new Error("not found: " + q);
  return p;
};
const wins = (names: string[]) => evaluateLineup(names.map(find), coeff).wins;

// ---- consensus sanity panel: elite teams should rank above quirky/one-dimensional ones ----
const PANEL: [string, string[]][] = [
  ["GOAT balanced", ["Michael Jordan", "Magic Johnson", "Larry Bird", "Tim Duncan", "Hakeem Olajuwon"]],
  ["Modern spacing", ["Stephen Curry", "Michael Jordan", "LeBron James", "Kevin Durant", "Nikola Joki"]],
  ["90s defense", ["Gary Payton", "Michael Jordan", "Scottie Pippen", "Dennis Rodman", "Hakeem Olajuwon"]],
  ["Twin towers + stars", ["Magic Johnson", "Kobe Bryant", "LeBron James", "Tim Duncan", "Kareem Abdul-Jabbar"]],
  ["All-defense", ["Gary Payton", "Tony Allen", "Scottie Pippen", "Kevin Garnett", "Bill Russell"]],
  ["Pure scorers", ["Allen Iverson", "Kobe Bryant", "Kevin Durant", "Carmelo Anthony", "Wilt Chamberlain"]],
  ["5 centers", ["Wilt Chamberlain", "Kareem Abdul-Jabbar", "Hakeem Olajuwon", "Shaquille O'Neal", "David Robinson"]],
  ["5 PGs", ["Stephen Curry", "Magic Johnson", "Chris Paul", "Steve Nash", "Isiah Thomas"]],
  ["Role players", ["Bruce Bowen", "Tony Allen", "P.J. Tucker", "Ben Wallace", "Dennis Rodman"]],
  ["1960s only", ["Oscar Robertson", "Jerry West", "Elgin Baylor", "Wilt Chamberlain", "Bill Russell"]],
];
console.log("=== consensus panel ===");
const scored = PANEL.map(([label, names]) => [label, wins(names)] as [string, number]).sort((a, b) => b[1] - a[1]);
for (const [label, w] of scored) console.log(`  ${String(w).padStart(2)}-${82 - w}  ${label}`);

// ---- exploit probes: degenerate constructions must NOT beat the balanced GOAT team ----
console.log("\n=== exploit probes ===");
const goat = wins(PANEL[0][1]);
const probes: [string, string[]][] = [
  ["Max-PPG stack", [...players].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0)).slice(0, 5).map((p) => p.name)],
  ["Max-REB stack", [...players].sort((a, b) => (b.trb ?? 0) - (a.trb ?? 0)).slice(0, 5).map((p) => p.name)],
  ["Max-AST stack", [...players].sort((a, b) => (b.ast ?? 0) - (a.ast ?? 0)).slice(0, 5).map((p) => p.name)],
  ["Max-USG stack", [...players].sort((a, b) => (b.usg ?? 0) - (a.usg ?? 0)).slice(0, 5).map((p) => p.name)],
];
for (const [label, names] of probes) {
  const w = wins(names);
  console.log(`  ${String(w).padStart(2)} wins  ${label}  ${w > goat ? "  <-- EXPLOIT (beats GOAT " + goat + ")" : "(ok, <= GOAT " + goat + ")"}`);
  console.log("     " + names.join(", "));
}

// ---- hill-climb to find the engine's true optimum (is 82-0 reachable? is the best team sane?) ----
const stars = [...players].filter((p) => (p.peak_score ?? 0) > 4).slice(0, 120);
function rng(s: number) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(7);
let globalBest = { w: 0, names: [] as string[] };
for (let start = 0; start < 40; start++) {
  let cur: Player[] = [];
  const used = new Set<number>();
  while (cur.length < 5) { const k = Math.floor(rand() * stars.length); if (!used.has(k)) { used.add(k); cur.push(stars[k]); } }
  let curW = evaluateLineup(cur, coeff).wins;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < 5; i++) {
      for (const cand of stars) {
        if (cur.some((p) => p.id === cand.id)) continue;
        const trial = cur.slice(); trial[i] = cand;
        const w = evaluateLineup(trial, coeff).wins;
        if (w > curW) { cur = trial; curW = w; improved = true; }
      }
    }
  }
  if (curW > globalBest.w) globalBest = { w: curW, names: cur.map((p) => `${p.name} ${p.year}`) };
}
console.log(`\n=== engine optimum (hill-climb, 40 starts over top-120 stars) ===`);
console.log(`  best record: ${globalBest.w}-${82 - globalBest.w}`);
console.log("  " + globalBest.names.join(", "));
