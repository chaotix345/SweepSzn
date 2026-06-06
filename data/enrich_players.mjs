// Enrich web/public/data/players.json with:
//   - team   : normalized to a CURRENT NBA franchise (so the slot-machine groups like 82-0)
//   - eligible: array of slottable positions (82-0's authentic multi-position eligibility)
// Sources 82-0's per-player franchise + positions from data/820_player_meta.json (committed),
// joined by name-slug (prefers the player's own decade), with adjacency fallback for the few
// players 82-0 doesn't carry (almost all 1940s). The ENGINE still uses the single `pos`, so this
// requires NO recalibration. Run after data/build_dataset.py:  node data/enrich_players.mjs
import fs from "node:fs";

const PLAYERS = "C:/Dev/Active/82-0.v2/web/public/data/players.json";
const META = "C:/Dev/Active/82-0.v2/data/820_player_meta.json";
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const SLOTSET = new Set(SLOTS);
const CURRENT = new Set("ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split(" "));
// historical / relocated B-R abbreviations -> current franchise (only the lineages that still exist)
const HIST = {
  SEA: "OKC", NJN: "BKN", NYN: "BKN", BRK: "BKN", PHO: "PHX", PHW: "GSW", SFW: "GSW",
  WSB: "WAS", BAL: "WAS", CAP: "WAS", CHH: "CHA", CHO: "CHA", NOH: "NOP", NOK: "NOP",
  NOJ: "UTA", KCK: "SAC", KCO: "SAC", CIN: "SAC", ROC: "SAC", SDC: "LAC", BUF: "LAC",
  SDR: "HOU", VAN: "MEM", FTW: "DET", MNL: "LAL", MLH: "ATL", STL: "ATL", TRI: "ATL",
  SYR: "PHI", DNN: "DEN", CHP: "WAS", CHZ: "WAS",
};
const ADJ = {
  PG: ["PG", "SG"], SG: ["SG", "PG", "SF"], SF: ["SF", "SG", "PF"],
  PF: ["PF", "SF", "C"], C: ["C", "PF"], G: ["PG", "SG"], F: ["SF", "PF"],
};
const slug = (s) => s.toLowerCase().replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const order = (arr) => SLOTS.filter((s) => arr.includes(s));
const mode = (arr) => { const c = {}; let best = arr[0], bn = 0; for (const x of arr) { c[x] = (c[x] || 0) + 1; if (c[x] > bn) { bn = c[x]; best = x; } } return best; };
const toCurrent = (t) => (CURRENT.has(t) ? t : HIST[t] || null);

const players = JSON.parse(fs.readFileSync(PLAYERS, "utf8"));
const meta = JSON.parse(fs.readFileSync(META, "utf8")); // slug -> [[era, team, "PG|SG"], ...]

let viaSameEra = 0, viaAnyEra = 0, viaFallback = 0, teamNorm = 0, teamKept = 0;
for (const p of players) {
  const rows = (meta[slug(p.name)] || []).map(([era, team, pos]) => ({ era, team, pos: pos ? pos.split("|") : [] }));
  const sameEra = rows.filter((r) => r.era === p.decade);
  const pool = sameEra.length ? sameEra : rows;

  // --- eligible positions ---
  const posSet = new Set();
  for (const r of pool) for (const x of r.pos) if (SLOTSET.has(x)) posSet.add(x);
  if (SLOTSET.has(p.pos)) posSet.add(p.pos); // always allow their natural (engine) position
  let eligible = order([...posSet]);
  if (!eligible.length) { eligible = order(ADJ[p.pos] || ADJ.F); viaFallback++; }
  else if (sameEra.length) viaSameEra++; else viaAnyEra++;
  p.eligible = eligible;

  // --- franchise normalization ---
  const ownCur = toCurrent(p.team); // current code for our peak-season team (if any)
  const poolTeams = pool.map((r) => toCurrent(r.team)).filter(Boolean);
  let franchise;
  if (ownCur && poolTeams.includes(ownCur)) franchise = ownCur;            // our peak team agrees with 82-0
  else if (poolTeams.length) franchise = mode(poolTeams);                  // 82-0's franchise for this player
  else franchise = ownCur;                                                 // historical map / already-current
  if (franchise && franchise !== p.team) { p.team = franchise; teamNorm++; } else teamKept++;
}

fs.writeFileSync(PLAYERS, JSON.stringify(players));
const bad = players.filter((p) => !CURRENT.has(p.team));
console.log(`enriched ${players.length} players`);
console.log(`eligible: sameEra=${viaSameEra} anyEra=${viaAnyEra} adjacencyFallback=${viaFallback}`);
console.log(`team: normalized=${teamNorm} kept=${teamKept} | still non-current (mostly pre-1960 defunct): ${bad.length}`);
const dist = {}; for (const p of players) { const n = p.eligible.length; dist[n] = (dist[n] || 0) + 1; }
console.log("eligible-count distribution:", JSON.stringify(dist));
console.log("non-current team codes:", [...new Set(bad.map((p) => p.team))].sort().join(" ") || "(none)");
