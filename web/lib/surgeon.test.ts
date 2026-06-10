// Hand-rolled checks for the Surgeon helpers (run: npx tsx lib/surgeon.test.ts).
import type { LineupResult, Player, Slot } from "./types";
import {
  surgeonSeedOk, surgeonDiagnosis, needOf, buildSurgeonPool, SURGEON_POOL_SIZE,
  encSurgeonScore, decodeSurgeonDelta, encodeSurgeonCard, decodeSurgeonCard,
} from "./surgeon";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// --- seeds ---
assert(surgeonSeedOk("surgeon-2026-6-10"), "seed: canonical accepted");
assert(!surgeonSeedOk("surgeon-2026-6"), "seed: missing day rejected");
assert(!surgeonSeedOk("daily-2026-6-10"), "seed: daily prefix rejected");
assert(!surgeonSeedOk("surgeon-2026-6-10x"), "seed: trailing junk rejected");

// --- diagnosis ---
const F = (label: string, value: number): LineupResult["factors"][number] =>
  ({ label, value, kind: value < 0 ? "bad" : "good" });
const d1 = surgeonDiagnosis([F("Star offense", 9), F("Usage overload (118% demand)", -4.2), F("Spacing (1.1 shooters)", -0.5)]);
assert(d1?.kind === "worst" && d1.canonical === "Usage overload" && d1.value === -4.2, "diagnosis: highest-magnitude negative wins");
const d2 = surgeonDiagnosis([F("Star offense", 9.1), F("Star defense", 4.0), F("Spacing (3.0 shooters)", 1.2)]);
assert(d2?.kind === "weakest" && d2.canonical === "Spacing" && d2.value === 1.2, "diagnosis: clean build falls back to smallest positive");
assert(surgeonDiagnosis([]) === null, "diagnosis: empty factors -> null");

// --- need mapping ---
assert(needOf("Usage overload") === "lowusage", "need: overload -> lowusage");
assert(needOf("Spacing") === "shoot", "need: spacing -> shoot");
assert(needOf("No interior size") === "rim" && needOf("Thin interior size") === "rim", "need: interior -> rim");
assert(needOf("No perimeter defender") === "perim", "need: perimeter -> perim");
assert(needOf("Star offense") === "off" && needOf("Star defense") === "def", "need: fallback strengths");

// --- pool building (deterministic, exclusions, eligibility, WHY copy) ---
const mk = (id: string, pos: Player["pos"], over: Partial<Player> = {}): Player => ({
  id, person_id: over.person_id ?? id, name: id.toUpperCase(), year: 2015, decade: "2010s",
  tier: "complete", team: "TST", pos, eligible: over.eligible ?? [pos as Slot],
  g: 70, mp: 30, obpm: 0, dbpm: 0, usg: 20, pts: 12, trb: 5, ast: 3, stl: 1, blk: 0.5, fg3: 1, fg3a: 3,
  z: { pts: 0, trb: 0, ast: 0, stl: 0, blk: 0, ts: 0 }, ...over,
});
const lineup = [
  mk("l_pg", "PG"), mk("l_sg", "SG"), mk("l_sf", "SF"), mk("l_pf", "PF"), mk("l_c", "C"),
];
const offered = [
  mk("shooter_a", "SG", { fg3: 3.2, fg3a: 8, z: { pts: 1, ts: 1, stl: 0 } }),
  mk("shooter_b", "SF", { fg3: 2.4, fg3a: 6, z: { pts: 0.5, ts: 0.8, stl: 0 } }),
  mk("shooter_c", "PG", { fg3: 2.0, fg3a: 5, z: { ts: 0.6, stl: 0 } }),
  mk("shooter_d", "SG", { fg3: 1.4, fg3a: 4, z: { ts: 0.5, stl: 0 } }),
  mk("big_a", "C", { trb: 13, blk: 2.8, dbpm: 3, z: { trb: 2.2, blk: 2.4 } }),
  mk("big_b", "PF", { trb: 11, blk: 1.9, dbpm: 2, z: { trb: 1.8, blk: 1.7 } }),
  mk("wing_stl", "SG", { stl: 2.4, z: { stl: 1.6 } }),
  mk("dupe_of_pg", "PG", { person_id: "l_pg" }),                       // same person as a drafted player
  mk("wrong_slot", "C", { eligible: undefined, pos: "C" }),            // eligible only where C sits — fine
];
const shootPool = buildSurgeonPool(lineup, offered, "shoot");
assert(shootPool.length === SURGEON_POOL_SIZE, "pool: exactly three dealt");
assert(shootPool[0].id === "shooter_a" && shootPool[1].id === "shooter_b", "pool: ranked by the need stat, best first");
assert(!shootPool.some((c) => c.id === "dupe_of_pg"), "pool: drafted person's other variant excluded");
assert(shootPool.every((c) => c.why.includes("floor spacer")), "pool: WHY copy names the need");
const shootPool2 = buildSurgeonPool(lineup, [...offered].reverse(), "shoot");
assert(JSON.stringify(shootPool.map((c) => c.id)) === JSON.stringify(shootPool2.map((c) => c.id)), "pool: input order does not matter (deterministic)");
const rimPool = buildSurgeonPool(lineup, offered, "rim");
assert(rimPool[0].id === "big_a" && rimPool[0].why.includes("rim anchor"), "pool: rim need deals the anchor first");
const perimPool = buildSurgeonPool(lineup, offered, "perim");
assert(perimPool[0].id === "wing_stl" && perimPool[0].stat.includes("SPG"), "pool: perim need deals the stopper first with SPG why");
const lowPool = buildSurgeonPool(lineup, offered, "lowusage");
assert(lowPool.length === 3 && lowPool.every((c) => c.stat.includes("USG")), "pool: lowusage deals three with usage why");

// --- score encoding (delta can be negative) ---
assert(encSurgeonScore(8, 5) > encSurgeonScore(7, 12), "score: delta outranks net");
assert(encSurgeonScore(3, 6) > encSurgeonScore(3, 5), "score: net is the tiebreak");
assert(decodeSurgeonDelta(encSurgeonScore(-12, -3)) === -12, "score: negative delta round-trips");
assert(decodeSurgeonDelta(encSurgeonScore(0, 0)) === 0, "score: zero delta round-trips");
assert(encSurgeonScore(-82, -100) >= 0, "score: worst case stays non-negative");

// --- /sg/ card round trip ---
const ids = ["aa_1", "bb_2", "cc_3", "dd_4", "ee_5"];
const card = encodeSurgeonCard(ids, 2, "ff_6");
const dec = decodeSurgeonCard(card);
assert(!!dec && dec.outIdx === 2 && dec.inId === "ff_6" && dec.beforeIds.join() === ids.join(), "card: encode/decode round trip");
assert(dec!.afterIds[2] === "ff_6" && dec!.afterIds[0] === "aa_1", "card: after lineup substitutes at the out index");
assert(decodeSurgeonCard("a,b,c,d.2.x") === null, "card: four ids rejected");
assert(decodeSurgeonCard(`${ids.join(",")}.5.ff_6`) === null, "card: out-of-range index rejected");
assert(decodeSurgeonCard(`${ids.join(",")}.2.aa_1`) === null, "card: swapping in a drafted id rejected");
assert(decodeSurgeonCard(`${ids.join(",")}.2`) === null, "card: missing part rejected");
assert(decodeSurgeonCard("aa_1,aa_1,cc_3,dd_4,ee_5.1.ff_6") === null, "card: duplicate before-ids rejected");

console.log(fail ? `\n${fail} SURGEON ASSERTION(S) FAILED` : "\nALL SURGEON CHECKS PASSED");
process.exit(fail ? 1 : 0);
