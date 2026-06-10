import { verifyDaily, verifyTrace, applySwapToTrace, type VerifyDeps } from "./dailyVerify";
import type { DraftStep, Player, LineupResult } from "./types";

// Fake spin world (no real data / no server-only) so we can exercise the verifier's logic.
const mkP = (id: string, slot: string, eligible?: string[]): Player =>
  ({ id, person_id: id, name: id, year: 2015, decade: "2010s", tier: "complete", team: "XXX", pos: slot, eligible: eligible ?? [slot] } as Player);

const basePool: Record<number, string[]> = {
  0: ["p0pg", "x0"], 1: ["p1sg", "x1"], 2: ["p2sf", "flexfwd", "swing", "x2"], 3: ["p3pf", "x3"], 4: ["p4c", "x4", "x4sf", "x4pf"],
};
// respin pools keyed by `${round}-${type}-${salt}` (salt = global re-spin count at that point)
const respinPool: Record<string, string[]> = {
  "2-team-1": ["p2sf_b"],   // round 2 team re-spin, first re-spin of the game
  "0-team-1": ["r0t"], "1-team-2": ["r1t"], // two team re-spins across rounds 0 and 1
  "3-team-1": ["rflex"],    // round 3 team re-spin offering a multi-eligible big (move-after-respin)
};
const players: Record<string, Player> = {
  p0pg: mkP("p0pg", "PG"), p1sg: mkP("p1sg", "SG"), p2sf: mkP("p2sf", "SF"), p3pf: mkP("p3pf", "PF"), p4c: mkP("p4c", "C"),
  p2sf_b: mkP("p2sf_b", "SF"), r0t: mkP("r0t", "PG"), r1t: mkP("r1t", "SG"),
  flexfwd: mkP("flexfwd", "PF", ["SF", "PF"]), // multi-eligible forward for the court-move scenario
  swing: mkP("swing", "SF", ["SF", "PF", "C"]), // tri-eligible — double-move chain scenario
  rflex: mkP("rflex", "PF", ["PF", "C"]),       // respin-offered multi-eligible big
  x0: mkP("x0", "PG"), x1: mkP("x1", "SG"), x2: mkP("x2", "SF"), x3: mkP("x3", "PF"), x4: mkP("x4", "C"),
  x4sf: mkP("x4sf", "SF"), x4pf: mkP("x4pf", "PF"),
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

// --- applySwapToTrace: the court move/swap must keep the trace replayable (live "slot reused" bug) ---
// User repro: round-2 spin offers a SF/PF-eligible forward; the player places him at PF, later
// moves him PF -> SF on the court, then drafts the real PF in round 3. Without re-stamping the
// trace, the round-3 pick lands on a "reused" PF and the Daily/challenge submit 400s.
{
  const moved: DraftStep[] = [
    { slot: "PG", pickedId: "p0pg", respins: [] },
    { slot: "SG", pickedId: "p1sg", respins: [] },
    { slot: "PF", pickedId: "flexfwd", respins: [] }, // placed at PF first...
    { slot: "PF", pickedId: "p3pf", respins: [] },    // ...PF re-picked after the court move
    { slot: "C", pickedId: "p4c", respins: [] },
  ];
  const broken = clone(moved);
  const r1 = verifyDaily("2025-1-1", broken, deps);
  assert(r1.ok === false && r1.error === "slot reused 3", "un-stamped trace reproduces the live 'slot reused 3' rejection");

  const fixed = clone(moved);
  // the court move happens BEFORE round 3 is drafted: flexfwd PF -> SF (SF empty at that point)
  applySwapToTrace(fixed.slice(0, 3), "flexfwd", null, "PF", "SF");
  const r2 = verifyDaily("2025-1-1", fixed, deps);
  assert(r2.ok === true, "re-stamped trace verifies after a move into an empty slot");
  assert(r2.ok === true && r2.lineup === "p0pg,p1sg,flexfwd,p3pf,p4c", "lineup serializes in the FINAL slot arrangement");
}
{
  // swap of two FILLED slots keeps both entries in lockstep (no error before, but the served
  // permalink/lineup used to show the pre-swap arrangement)
  const t = clone(legit);
  applySwapToTrace(t, "p2sf", "p3pf", "SF", "PF"); // hypothetical SF<->PF swap of two placed players
  assert(t[2].slot === "PF" && t[3].slot === "SF", "both swapped entries re-stamped");
  assert(t[0].slot === "PG" && t[4].slot === "C", "unrelated entries untouched");
}
{
  const t = clone(legit);
  applySwapToTrace(t, null, null, "SF", "PF");
  assert(JSON.stringify(t) === JSON.stringify(legit), "no-op when both ids are null");
}
{
  // move-then-move-back: ID matching means the second call finds the entry at its CURRENT
  // (already re-stamped) slot, so a round trip restores the original stamp exactly
  const t: DraftStep[] = [{ slot: "PF", pickedId: "flexfwd", respins: [] }];
  applySwapToTrace(t, "flexfwd", null, "PF", "SF");
  assert(t[0].slot === "SF", "first move re-stamps PF -> SF");
  applySwapToTrace(t, "flexfwd", null, "SF", "PF");
  assert(t[0].slot === "PF", "move-back restores the original slot (round trip)");
}
{
  // double-move chain through two empty slots: swing drafted at SF, moved SF -> PF, then PF -> C,
  // then PF and SF are both re-drafted. The full replay must verify under the final arrangement.
  const chain: DraftStep[] = [
    { slot: "PG", pickedId: "p0pg", respins: [] },
    { slot: "SG", pickedId: "p1sg", respins: [] },
    { slot: "SF", pickedId: "swing", respins: [] },
    { slot: "PF", pickedId: "p3pf", respins: [] },
    { slot: "SF", pickedId: "x4sf", respins: [] }, // SF re-picked after the chain vacated it
  ];
  const broken = clone(chain);
  assert(verifyDaily("2025-1-1", broken, deps).ok === false, "un-stamped double-move chain rejected (slot reused)");
  const fixed = clone(chain);
  applySwapToTrace(fixed.slice(0, 3), "swing", null, "SF", "PF"); // move 1, before round 3
  applySwapToTrace(fixed.slice(0, 3), "swing", null, "PF", "C");  // move 2, still before round 3
  const rc = verifyDaily("2025-1-1", fixed, deps);
  assert(rc.ok === true, "double-move chain verifies after both re-stamps");
  assert(rc.ok === true && rc.lineup === "p0pg,p1sg,x4sf,p3pf,swing", "chain lineup serializes in the FINAL slots");
}
{
  // move-after-respin: a player offered by a TEAM re-spin is placed, then moved. The replay must
  // reconstruct the re-spin pool AND re-check eligibility against the re-stamped (new) slot.
  const t: DraftStep[] = [
    { slot: "PG", pickedId: "p0pg", respins: [] },
    { slot: "SG", pickedId: "p1sg", respins: [] },
    { slot: "SF", pickedId: "p2sf", respins: [] },
    { slot: "PF", pickedId: "rflex", respins: ["team"] }, // placed at PF off the re-spin pool...
    { slot: "PF", pickedId: "x4pf", respins: [] },        // ...PF re-picked after the court move
  ];
  const broken = clone(t);
  assert(verifyDaily("2025-1-1", broken, deps).ok === false, "un-stamped move-after-respin rejected (slot reused)");
  const fixed = clone(t);
  applySwapToTrace(fixed.slice(0, 4), "rflex", null, "PF", "C"); // move PF -> C before round 4
  const rr = verifyDaily("2025-1-1", fixed, deps);
  assert(rr.ok === true, "move-after-respin verifies: re-spin pool reconstructed + eligibility re-checked at the new slot");
}

// verifyTrace: the seed-agnostic core works for any seed (e.g. an H2H challenge), not just daily
const chal = verifyTrace("h2h-abc123", legit, deps);
assert(chal.ok === true, "verifyTrace verifies a legit trace under an arbitrary (challenge) seed");
assert(chal.ok === true && chal.lineup === "p0pg,p1sg,p2sf,p3pf,p4c", "verifyTrace serializes in slot order");
const chalBad = clone(legit); chalBad[0].pickedId = "not_on_pool";
assert(verifyTrace("h2h-abc123", chalBad, deps).ok === false, "verifyTrace rejects an off-pool pick");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL VERIFY CHECKS PASSED");
process.exit(fail ? 1 : 0);
