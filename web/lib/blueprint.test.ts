// Hand-rolled checks for the Blueprint helpers (run: npx tsx lib/blueprint.test.ts).
import type { LineupResult, Player } from "./types";
import {
  bpSeedOk, bpCode, bpFromCode, bpKeyOk, BLUEPRINTS, blueprintDef, blueprintMetric,
  gradeBlueprint, encBpScore, decodeBpDisplay, BP_MULT, type BlueprintKey,
} from "./blueprint";
import { encodeLineup, decodeShare } from "./share";
import { decodePickemCard, encodePickemCard } from "./pickem";
import { evaluateLineup } from "./engine";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// --- seeds ---
assert(bpSeedOk("bp-2026-6-10"), "bp seed: canonical accepted");
assert(bpSeedOk("bp-2026-12-31"), "bp seed: two-digit month/day accepted");
assert(!bpSeedOk("bp-2026-6"), "bp seed: missing day rejected");
assert(!bpSeedOk("daily-2026-6-10"), "bp seed: daily prefix rejected");
assert(!bpSeedOk("bp-2026-6-10x"), "bp seed: trailing junk rejected");
assert(!bpSeedOk(42), "bp seed: non-string rejected");

// --- key/code mapping ---
const KEYS: BlueprintKey[] = ["spacing", "fortress", "discipline", "rim", "balanced"];
for (const k of KEYS) assert(bpFromCode(bpCode(k)) === k, `code round-trip: ${k}`);
assert(bpFromCode("z") === null, "unknown code -> null");
assert(bpFromCode(null) === null, "null code -> null");
assert(bpKeyOk("spacing") && !bpKeyOk("SPACING") && !bpKeyOk("all"), "bpKeyOk allowlist");
assert(new Set(KEYS.map(bpCode)).size === 5, "five distinct share codes");
assert(BLUEPRINTS.length === 5 && KEYS.every((k) => blueprintDef(k).key === k), "five blueprint defs resolvable");

// --- metric derivation from a synthetic LineupResult ---
const synth = (over: Partial<LineupResult> = {}): LineupResult => ({
  ortg: 115, drtg: 105, netRtg: 10, wins: 70, losses: 12, winPct: 0.85, grade: "A", label: "DYNASTY",
  factors: [
    { label: "Star offense", value: 9.1, kind: "good" },
    { label: "Star defense", value: 8.2, kind: "good" },
    { label: "Spacing (3.4 shooters)", value: 1.8, kind: "good" },
    { label: "Thin interior size", value: -1.4, kind: "bad" },
  ],
  players: [
    { id: "a", name: "A", off: 5, def: 2.0, usage: 24.5, shooter: true, rimProtector: false },
    { id: "b", name: "B", off: 4, def: 1.0, usage: 21.0, shooter: true, rimProtector: false },
    { id: "c", name: "C", off: 3, def: 3.5, usage: 18.5, shooter: false, rimProtector: true },
    { id: "d", name: "D", off: 2, def: 2.5, usage: 17.0, shooter: false, rimProtector: true },
    { id: "e", name: "E", off: 1, def: 0.5, usage: 15.0, shooter: false, rimProtector: false },
  ],
  notes: [], ...over,
});
const r = synth();
assert(blueprintMetric("spacing", r) === 1.8, "spacing metric = Spacing factor value");
assert(blueprintMetric("fortress", r) === 8.2, "fortress metric = Star defense factor value");
assert(Math.abs(blueprintMetric("discipline", r) - 96) < 1e-9, "discipline metric = exact usage sum");
assert(Math.abs(blueprintMetric("rim", r) - (3.5 + 2.5) * 0.742) < 1e-9, "rim metric = defScale-weighted rim-protector def");
assert(blueprintMetric("balanced", r) === 10, "balanced metric = net rating");
assert(blueprintMetric("spacing", synth({ factors: [] })) === 0, "suppressed spacing factor -> 0");

// --- grading bands + multipliers ---
const gSp = gradeBlueprint("spacing", synth({ factors: [{ label: "Spacing (4.0 shooters)", value: 2.6, kind: "good" }] }));
assert(gSp.grade === "A+" && gSp.mult === 1.3, "spacing 2.6 -> A+ x1.3");
const gSpB = gradeBlueprint("spacing", r);
assert(gSpB.grade === "B" && gSpB.mult === BP_MULT.B, "spacing 1.8 -> B");
assert(gradeBlueprint("spacing", synth({ factors: [{ label: "Spacing (0.2 shooters)", value: -1.0, kind: "bad" }] })).grade === "F", "negative spacing -> F");
const gd = gradeBlueprint("discipline", r); // usage 96 -> B band (<=100), lowerIsBetter
assert(gd.grade === "B", `discipline 96 -> B (got ${gd.grade})`);
assert(gradeBlueprint("discipline", synth({ players: r.players.map((p) => ({ ...p, usage: 17 })) })).grade === "A+", "usage 85 -> A+");
assert(gradeBlueprint("discipline", synth({ players: r.players.map((p) => ({ ...p, usage: 30 })) })).grade === "F", "usage 150 -> F");
const gb = gradeBlueprint("balanced", synth({ netRtg: 14.2 }));
assert(gb.grade === "A+" && gb.metricText === "14.2", "balanced 14.2 -> A+ with formatted metric");
// composite score = wins x mult with net tiebreak folded out of the display
assert(gb.score === decodeBpDisplay(encBpScore(70, 1.3, 14.2)), "view score matches encoded display score");
assert(Math.abs(gb.score - 91) < 1e-9, "70 wins x 1.3 -> 91.0");

// --- sort-score encoding ---
assert(encBpScore(70, 1.3, 5) > encBpScore(70, 1.22, 9), "higher mult outranks higher net");
assert(encBpScore(70, 1.3, 6) > encBpScore(70, 1.3, 5), "net is the tiebreak");
assert(decodeBpDisplay(encBpScore(82, 1.0, 0)) === 82, "decode: clean integer display");
assert(decodeBpDisplay(encBpScore(73, 1.05, 0)) === 76.65, "decode: fractional display survives");
assert(encBpScore(0, 1.0, -200) >= 0, "net clamp: floor");

// --- share segment round-trip with the b<code>~ prefix ---
const ids = ["aa_1", "bb_2", "cc_3", "dd_4", "ee_5"];
for (const k of KEYS) {
  const seg = encodeLineup(ids, false, false, bpCode(k));
  const dec = decodeShare(seg);
  assert(seg.startsWith(`b${bpCode(k)}~`) && dec.bp === bpCode(k) && dec.ids.join() === ids.join() && !dec.hinted && !dec.prime,
    `share round-trip: ${k}`);
}
const hintedSeg = encodeLineup(ids, true, false, "s");
const hintedDec = decodeShare(hintedSeg);
assert(hintedDec.bp === "s" && hintedDec.hinted && hintedDec.ids.length === 5, "share round-trip: bp + hints stacked");
const plain = decodeShare(encodeLineup(ids));
assert(plain.bp === null && !plain.hinted && !plain.prime, "share round-trip: no flags unchanged");
const primeDec = decodeShare(encodeLineup(ids, true, true));
assert(primeDec.prime && primeDec.hinted && primeDec.bp === null, "share round-trip: prime+hint unchanged");

// --- pickem card segment validator accepts every encodeLineup prefix ---
const view = { y: 3, n: 1, vote: "y" as const };
assert(decodePickemCard(encodePickemCard(encodeLineup(ids, true, false, "s"), view)) !== null, "pe card: b~+h~ lineup accepted");
assert(decodePickemCard(encodePickemCard(encodeLineup(ids, false, true), view)) !== null, "pe card: p~ lineup accepted (latent gap closed)");
assert(decodePickemCard(encodePickemCard(encodeLineup(ids), view)) !== null, "pe card: bare lineup still accepted");
assert(decodePickemCard("3.1.y.zz~" + ids.join(",")) === null, "pe card: unknown prefix shape rejected");

// --- integration: grade from a real engine evaluation ---
const mk = (id: string, pos: Player["pos"], over: Partial<Player> = {}): Player => ({
  id, name: id.toUpperCase(), year: 2015, decade: "2010s", tier: "complete", team: "TST", pos,
  g: 70, mp: 30, obpm: 3, dbpm: 1, usg: 22, pts: 20, trb: 5, ast: 4,
  z: { pts: 1, trb: 0.5, ast: 0.5, stl: 0.7, blk: 0.2, ts: 0.5 }, ...over,
});
const five = [
  mk("pg", "PG"), mk("sg", "SG"), mk("sf", "SF"),
  mk("pf", "PF", { z: { pts: 0.5, trb: 1.5, ast: 0, stl: 0, blk: 1.5, ts: 0.3 }, dbpm: 2 }),
  mk("ce", "C", { z: { pts: 0.5, trb: 2.0, ast: 0, stl: 0, blk: 2.0, ts: 0.3 }, dbpm: 3 }),
];
const real = evaluateLineup(five);
for (const k of KEYS) {
  const v = gradeBlueprint(k, real);
  assert(Number.isFinite(v.metric) && typeof v.grade === "string" && v.mult >= 1 && v.mult <= 1.3 && v.score > 0,
    `integration: ${k} grades a real engine result (metric=${v.metric.toFixed(2)}, ${v.grade}, x${v.mult})`);
}
const usageSum = real.players.reduce((a, p) => a + p.usage, 0);
assert(Math.abs(blueprintMetric("discipline", real) - usageSum) < 1e-9, "integration: discipline reads the engine's exact usage sum");

console.log(fail ? `\n${fail} BLUEPRINT ASSERTION(S) FAILED` : "\nALL BLUEPRINT CHECKS PASSED");
process.exit(fail ? 1 : 0);
