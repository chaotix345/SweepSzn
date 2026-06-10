import type { Player } from "./types";
import { PRIME_MIN_PEOPLE, primeScore, peakVariant, buildPrimePools } from "./prime";
import { encodeLineup, decodeShare } from "./share";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

const mk = (over: Partial<Player>): Player => ({
  id: "x", name: "X", year: 2000, decade: "2000s", tier: "complete", team: "LAL", pos: "SF",
  pts: 0, ast: 0, trb: 0, ...over,
} as Player);

// --- primeScore: position-weighted pts+ast+reb ---
assert(primeScore(mk({ pos: "PG", pts: 20, ast: 10, trb: 4 })) === 20 + 15 + 3.2, "guard weights creation (1.5x ast)");
assert(primeScore(mk({ pos: "C", pts: 20, ast: 4, trb: 12 })) === 20 + 3.2 + 16.8, "big weights the glass (1.4x reb)");
assert(primeScore(mk({ pos: "SF", pts: 20, ast: 5, trb: 6 })) === 20 + 5.5 + 6.6, "wing balanced (1.1x both)");
assert(primeScore(mk({ pos: "PG", pts: null, ast: null, trb: null })) === 0, "null stats -> 0");
{
  const guardLine = { pts: 18, ast: 9, trb: 3 };
  assert(primeScore(mk({ pos: "PG", ...guardLine })) > primeScore(mk({ pos: "C", ...guardLine })), "same line scores higher at guard when assist-heavy");
}

// --- peakVariant: weighted max, deterministic tiebreaks ---
{
  const young = mk({ id: "kobe_1998", year: 1998, pos: "SG", pts: 15.4, ast: 2.5, trb: 3.1 });
  const peak = mk({ id: "kobe_2006", year: 2006, pos: "SG", pts: 35.4, ast: 4.5, trb: 5.3 });
  assert(peakVariant([young, peak]) === peak, "highest offensive contribution wins");
  assert(peakVariant([peak, young]) === peak, "order-independent");
}
{
  const a = mk({ id: "b_late", year: 2010, pos: "SF", pts: 20, ast: 5, trb: 5 });
  const b = mk({ id: "a_early", year: 2005, pos: "SF", pts: 20, ast: 5, trb: 5 });
  assert(peakVariant([a, b]) === a, "score tie -> later year wins");
  const c = mk({ id: "aa_same", year: 2010, pos: "SF", pts: 20, ast: 5, trb: 5 });
  assert(peakVariant([a, c]) === c, "score+year tie -> lexicographically smaller id (deterministic)");
}
assert(peakVariant([]) === null, "empty variants -> null");

// --- buildPrimePools: dedupe per person, exclude thin franchises, sort by peak_score ---
const roster = (team: string, n: number, perPerson = 1): Player[] => {
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
    for (let v = 0; v < perPerson; v++) {
      out.push(mk({
        id: `${team}_p${i}_v${v}`, team, person_id: `person_${team}_${i}`,
        year: 1990 + v * 10, decade: v === 0 ? "1990s" : "2000s",
        pts: 10 + i + v * 5, peak_score: i + v,
      }));
    }
  }
  return out;
};
{
  const pools = buildPrimePools([...roster("LAL", 9, 2), ...roster("OKC", 7, 2)]);
  assert(pools.teams.length === 1 && pools.teams[0] === "LAL", `franchise under ${PRIME_MIN_PEOPLE} people excluded (OKC=7)`);
  const lal = pools.byTeam.get("LAL")!;
  assert(lal.length === 9, "one entry per person_id (18 rows -> 9)");
  assert(lal.every((p) => p.decade === "2000s"), "the peak variant survives (v1 has +5 pts)");
  assert(lal.every((p, i, a) => i === 0 || (a[i - 1].peak_score ?? 0) >= (p.peak_score ?? 0)), "pool sorted by peak_score desc");
}
{
  const pools = buildPrimePools(roster("BOS", 8, 1));
  assert(pools.teams.includes("BOS"), "exactly 8 people qualifies");
  const noPerson = [...roster("NYK", 7, 1), mk({ id: "nyk_solo", team: "NYK", pts: 5 })]; // person_id falls back to id
  assert(buildPrimePools(noPerson).teams.includes("NYK"), "missing person_id falls back to id for distinctness");
}
assert(buildPrimePools([]).teams.length === 0, "no players -> no teams");

// --- share codec: p~ prefix (the hinted-flag pattern) ---
const IDS = ["a1", "b2", "c3", "d4", "e5"];
assert(encodeLineup(IDS, false, true) === "p~a1,b2,c3,d4,e5", "prime flag prefixes p~");
assert(encodeLineup(IDS, true, true) === "p~h~a1,b2,c3,d4,e5", "prime + hints stack");
assert(encodeLineup(IDS, true) === "h~a1,b2,c3,d4,e5", "2-arg call unchanged (back-compat)");
{
  const d = decodeShare("p~h~a1,b2,c3,d4,e5");
  assert(d.prime && d.hinted && d.ids.length === 5, "p~h~ decodes both flags");
}
{
  const d = decodeShare("h~p~a1,b2,c3,d4,e5");
  assert(d.prime && d.hinted, "flag order-independent");
}
{
  const d = decodeShare("p~a1,b2,c3,d4,e5");
  assert(d.prime && !d.hinted, "prime alone");
  const r = decodeShare("a1,b2,c3,d4,e5");
  assert(!r.prime && !r.hinted && r.ids.length === 5, "plain segment unchanged");
}
assert(!decodeShare("p~p~a1,b2").prime || decodeShare("p~p~a1,b2").ids[0] === "p~a1", "double p~ doesn't loop forever (second stays in id, later validation rejects)");

console.log(fail ? `\n${fail} PRIME ASSERTION(S) FAILED` : "\nALL PRIME CHECKS PASSED");
process.exit(fail ? 1 : 0);
