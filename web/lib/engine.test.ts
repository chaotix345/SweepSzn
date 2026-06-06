import { evaluateLineup } from "./engine";
import type { Player } from "./types";

function mk(o: Partial<Player>): Player {
  return {
    id: o.name!.toLowerCase().replace(/\W+/g, "_"),
    name: o.name!, year: o.year ?? 2015, decade: "2010s", tier: "complete",
    team: "XXX", pos: o.pos ?? "SF", g: 75, mp: 34,
    ...o,
  } as Player;
}

// Balanced two-way team: spacing, a rim protector, sane usage spread.
const balanced: Player[] = [
  mk({ name: "Floor General", pos: "PG", obpm: 4, dbpm: 1.5, usg: 24, fg3a: 7, fg3: 2.9, year: 2016, z: { stl: 0.9 } }),
  mk({ name: "3&D Guard", pos: "SG", obpm: 2.5, dbpm: 1.2, usg: 18, fg3a: 6, fg3: 2.4, year: 2015, z: { stl: 0.7 } }),
  mk({ name: "Two-Way Wing", pos: "SF", obpm: 5, dbpm: 2.5, usg: 26, fg3a: 5, fg3: 1.9, year: 2014, z: { stl: 0.8 } }),
  mk({ name: "Stretch Four", pos: "PF", obpm: 3, dbpm: 2, usg: 18, fg3a: 5, fg3: 1.9, year: 2019, z: { blk: 0.5 } }),
  mk({ name: "Anchor Center", pos: "C", obpm: 4, dbpm: 3.5, usg: 22, fg3a: 0, fg3: 0, year: 2016, z: { blk: 1.6, drb: 1.4 } }),
];

// Stat-stuffer: five ball-dominant scorers, weak defense, no spacing, no rim.
const stuffer: Player[] = [
  mk({ name: "Volume A", pos: "PG", obpm: 6, dbpm: -1, usg: 33, fg3a: 0, fg3: 0, z: { stl: 0.2 } }),
  mk({ name: "Volume B", pos: "SG", obpm: 6, dbpm: -1, usg: 32, fg3a: 0, fg3: 0, z: { stl: 0.1 } }),
  mk({ name: "Volume C", pos: "SF", obpm: 5.5, dbpm: -0.5, usg: 31, fg3a: 0, fg3: 0, z: { stl: 0.2 } }),
  mk({ name: "Volume D", pos: "PG", obpm: 5.5, dbpm: -1, usg: 32, fg3a: 0, fg3: 0, z: { stl: 0.1 } }),
  mk({ name: "Volume E", pos: "SG", obpm: 5, dbpm: -1, usg: 30, fg3a: 0, fg3: 0, z: { stl: 0.2 } }),
];

const b = evaluateLineup(balanced);
const s = evaluateLineup(stuffer);

console.log("BALANCED:", `${b.wins}-${b.losses}`, `ORtg ${b.ortg} DRtg ${b.drtg} Net ${b.netRtg}`, b.label);
console.log("  factors:", b.factors.map((f) => `${f.label} ${f.value}`).join(" | "));
console.log("STUFFER :", `${s.wins}-${s.losses}`, `ORtg ${s.ortg} DRtg ${s.drtg} Net ${s.netRtg}`, s.label);
console.log("  factors:", s.factors.map((f) => `${f.label} ${f.value}`).join(" | "));

let fail = 0;
function assert(cond: boolean, msg: string) { if (!cond) { console.error("FAIL:", msg); fail++; } else console.log("ok:", msg); }

assert(b.wins > s.wins, "balanced two-way team beats stat-stuffer");
assert(s.netRtg < b.netRtg - 8, "stat-stuffer is far worse on net rating");
assert(s.wins < 55, "defense-less stuffer is not a juggernaut");
assert(b.wins <= 82 && s.wins >= 0, "win totals in range");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL BEHAVIOR CHECKS PASSED");
process.exit(fail ? 1 : 0);
