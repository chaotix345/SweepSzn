import { verifyDaily, verifyTrace, type VerifyDeps } from "./dailyVerify";
import type { DraftStep, Player, LineupResult } from "./types";

// Fake spin world (no real data / no server-only) so we can exercise the verifier's logic.
const mkP = (id: string, slot: string): Player =>
  ({ id, person_id: id, name: id, year: 2015, decade: "2010s", tier: "complete", team: "XXX", pos: slot, eligible: [slot] } as Player);

const basePool: Record<number, string[]> = {
  0: ["p0pg", "x0"], 1: ["p1sg", "x1"], 2: ["p2sf", "x2"], 3: ["p3pf", "x3"], 4: ["p4c", "x4"],
};
// respin pools keyed by `${round}-${type}-${salt}` (salt = global re-spin count at that point)
const respinPool: Record<string, string[]> = {
  "2-team-1": ["p2sf_b"],   // round 2 team re-spin, first re-spin of the game
  "0-team-1": ["r0t"], "1-team-2": ["r1t"], // two team re-spins across rounds 0 and 1
};
const players: Record<string, Player> = {
  p0pg: mkP("p0pg", "PG"), p1sg: mkP("p1sg", "SG"), p2sf: mkP("p2sf", "SF"), p3pf: mkP("p3pf", "PF"), p4c: mkP("p4c", "C"),
  p2sf_b: mkP("p2sf_b", "SF"), r0t: mkP("r0t", "PG"), r1t: mkP("r1t", "SG"),
  x0: mkP("x0", "PG"), x1: mkP("x1", "SG"), x2: mkP("x2", "SF"), x3: mkP("x3", "PF"), x4: mkP("x4", "C"),
};

const deps: VerifyDeps = {
  spinPool: (_seed, round, opts) => {
    if (opts.lockedDecade) return { team: `T${round}b`, decade: opts.lockedDecade, ids: respinPool[`${round}-team-${opts.salt}`] ?? [] };
    if (opts.lockedTeam) return { team: opts.lockedTeam, decade: `D${round}b`, ids: respinPool[`${round}-era-${opts.salt}`] ?? [] };
    return { team: `T${round}`, decade: `D${round}`, ids: basePool[round] };
  },
  getPlayer: (id) => players[id],
  evaluate: () => ({ wins: 60, losses: 22, netRtg: 8.3, ortg: 112, drtg: 103.7, winPct: 0.73, grade: "A", label: "Contender", factors: [], players: [], notes: [] } as LineupResult),
};

const legit: DraftStep[] = [
  { slot: "PG", pickedId: "p0pg", respins: [] },
  { slot: "SG", pickedId: "p1sg", respins: [] },
  { slot: "SF", pickedId: "p2sf", respins: [] },
  { slot: "PF", pickedId: "p3pf", respins: [] },
  { slot: "C", pickedId: "p4c", respins: [] },
];
const clone = (t: DraftStep[]): DraftStep[] => JSON.parse(JSON.stringify(t));

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

const ok = verifyDaily("2025-1-1", legit, deps);
assert(ok.ok === true, "legit lineup verifies");
assert(ok.ok === true && ok.lineup === "p0pg,p1sg,p2sf,p3pf,p4c", "lineup serialized in slot order");
assert(ok.ok === true && ok.result.wins === 60, "score comes from the engine, not the client");

const offpool = clone(legit); offpool[0].pickedId = "michael_jordan";
assert(verifyDaily("2025-1-1", offpool, deps).ok === false, "off-pool pick rejected");

const dup = clone(legit); dup[1].slot = "PG";
assert(verifyDaily("2025-1-1", dup, deps).ok === false, "duplicate slot rejected");

const ineligible = clone(legit); ineligible[0].slot = "C"; // p0pg is PG-only
assert(verifyDaily("2025-1-1", ineligible, deps).ok === false, "ineligible slot rejected");

assert(verifyDaily("2025-1-1", legit.slice(0, 4), deps).ok === false, "trace length != 5 rejected");

const respin = clone(legit); respin[2] = { slot: "SF", pickedId: "p2sf_b", respins: ["team"] };
assert(verifyDaily("2025-1-1", respin, deps).ok === true, "valid team re-spin accepted (salt=1)");

const tooMany = clone(legit);
tooMany[0] = { slot: "PG", pickedId: "r0t", respins: ["team"] };
tooMany[1] = { slot: "SG", pickedId: "r1t", respins: ["team"] };
assert(verifyDaily("2025-1-1", tooMany, deps).ok === false, "more than one team re-spin rejected");

// verifyTrace: the seed-agnostic core works for any seed (e.g. an H2H challenge), not just daily
const chal = verifyTrace("h2h-abc123", legit, deps);
assert(chal.ok === true, "verifyTrace verifies a legit trace under an arbitrary (challenge) seed");
assert(chal.ok === true && chal.lineup === "p0pg,p1sg,p2sf,p3pf,p4c", "verifyTrace serializes in slot order");
const chalBad = clone(legit); chalBad[0].pickedId = "not_on_pool";
assert(verifyTrace("h2h-abc123", chalBad, deps).ok === false, "verifyTrace rejects an off-pool pick");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL VERIFY CHECKS PASSED");
process.exit(fail ? 1 : 0);
