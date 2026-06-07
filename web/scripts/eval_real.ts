import fs from "node:fs";
import path from "node:path";
import { evaluateLineup, DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients } from "../lib/types";

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const coeffRaw = JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8"));
const coeff: Coefficients = { ...DEFAULT_COEFFICIENTS, ...coeffRaw };

function find(q: string): Player {
  const p = players.find((x) => x.name === q) || players.find((x) => x.name.includes(q));
  if (!p) throw new Error("not found: " + q);
  return p;
}
function run(label: string, names: string[]) {
  const lineup = names.map(find);
  const r = evaluateLineup(lineup, coeff);
  console.log(`\n${label}: ${r.wins}-${r.losses}  ${r.label}  (ORtg ${r.ortg} / DRtg ${r.drtg} / Net ${r.netRtg})`);
  console.log("  " + lineup.map((p) => `${p.name.split(" ").slice(-1)} ${p.year}`).join(", "));
  console.log("  " + r.factors.map((f) => `${f.label} ${f.value > 0 ? "+" : ""}${f.value}`).join(" | "));
}

run("All-time balanced (MJ/Magic/Bird/Duncan/Hakeem)", ["Michael Jordan", "Magic Johnson", "Larry Bird", "Tim Duncan", "Hakeem Olajuwon"]);
run("Modern superteam (Curry/MJ/LeBron/KD/Jokic)", ["Stephen Curry", "Michael Jordan", "LeBron James", "Kevin Durant", "Nikola Joki"]);
run("Elite defense (Russell/Garnett/Pippen/Payton/Duncan)", ["Bill Russell", "Kevin Garnett", "Scottie Pippen", "Gary Payton", "Tim Duncan"]);
run("Stat-stuffers (Westbrook/Harden/Oscar/Wilt/Maravich)", ["Russell Westbrook", "James Harden", "Oscar Robertson", "Wilt Chamberlain", "Pete Maravich"]);
run("Wilt + 4 low-usage roleplayers", ["Wilt Chamberlain", "Bruce Bowen", "Ben Wallace", "Tony Allen", "P.J. Tucker"]);
run("5 PGs (positional chaos)", ["Stephen Curry", "Magic Johnson", "Chris Paul", "Steve Nash", "Isiah Thomas"]);

// search for the engine's best achievable lineup among top stars (mulberry32 PRNG)
// one variant per real person, so the search can't stack two Wilts/LeBrons
const pid = (p: Player) => p.person_id ?? p.id;
const bestByPerson = new Map<string, Player>();
for (const p of [...players].sort((a, b) => (b.peak_score ?? 0) - (a.peak_score ?? 0)))
  if (!bestByPerson.has(pid(p))) bestByPerson.set(pid(p), p);
const stars = [...bestByPerson.values()].filter((p) => (p.peak_score ?? 0) > 5).slice(0, 80);
function rng(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(12345);
let best = { wins: 0, names: [] as string[] };
for (let i = 0; i < 8000; i++) {
  const pick: Player[] = [];
  const used = new Set<number>();
  let guard = 0;
  while (pick.length < 5 && guard++ < 200) {
    const k = Math.floor(rand() * stars.length);
    if (!used.has(k)) { used.add(k); pick.push(stars[k]); }
  }
  const r = evaluateLineup(pick, coeff);
  if (r.wins > best.wins) best = { wins: r.wins, names: pick.map((p) => `${p.name} ${p.year}`) };
}
console.log(`\nBest found in random search of top-80 stars (8000 tries): ${best.wins} wins`);
console.log("  " + best.names.join(", "));
