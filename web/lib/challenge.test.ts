import { newChallengeId, challengeSeed, compareResults, buildOwnerView } from "./challenge";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// newChallengeId: 8 chars, [a-z0-9], comma-free, won't collide with the daily seed format
const ids = Array.from({ length: 2000 }, () => newChallengeId());
assert(ids.every((id) => /^[a-z0-9]{8}$/.test(id)), "id is 8 chars of [a-z0-9]");
assert(ids.every((id) => !id.includes(",")), "id is comma-free");
assert(new Set(ids).size === ids.length, "ids are unique across 2000 mints");

// challengeSeed
assert(challengeSeed("abc12345") === "h2h-abc12345", "seed is h2h-<id>");
assert(!challengeSeed("abc12345").startsWith("daily-"), "challenge seed never collides with daily- seeds");

// compareResults: winner by wins, tiebreak netRtg, else tie
assert(compareResults({ wins: 80, netRtg: 10 }, { wins: 78, netRtg: 20 }).winner === "a", "more wins wins (a)");
assert(compareResults({ wins: 70, netRtg: 5 }, { wins: 75, netRtg: 1 }).winner === "b", "more wins wins (b)");
assert(compareResults({ wins: 70, netRtg: 8.4 }, { wins: 70, netRtg: 8.1 }).winner === "a", "wins tie -> higher netRtg wins (a)");
assert(compareResults({ wins: 70, netRtg: 8.1 }, { wins: 70, netRtg: 8.4 }).winner === "b", "wins tie -> higher netRtg wins (b)");
assert(compareResults({ wins: 70, netRtg: 8.0 }, { wins: 70, netRtg: 8.0 }).winner === "tie", "exact tie -> tie");
const m = compareResults({ wins: 80, netRtg: 12.5 }, { wins: 78, netRtg: 9.5 });
assert(m.winsMargin === 2 && Math.abs(m.netMargin - 3) < 1e-9, "margins are a minus b");

// buildOwnerView: creator dashboard assembly
const getPlayer = (id: string) => ({ id, name: id.toUpperCase(), team: "LAL", decade: "2010" });
const cInfo = { uid: "u_creator", name: "Charlie", wins: 70, losses: 12, net: 6.0, grade: "A", lineup: "a,b,c,d,e", hinted: false };
const rows = [
  { uid: "u_friend", name: "Sam", wins: 72, losses: 10, net: 5.0, lineup: "f,g,h,i,j", rank: 1 },
  { uid: "u_creator", name: "Charlie", wins: 70, losses: 12, net: 6.0, lineup: "a,b,c,d,e", rank: 2 },
  { uid: "u_lo", name: "Lo", wins: 68, losses: 14, net: 4.0, lineup: "k,l,m,n,o", rank: 3 },
];
const ov = buildOwnerView("abc12345", cInfo, rows, 3, getPlayer);
assert(ov.responders.length === 2, "creator is excluded from their own responder list");
assert(ov.responders.every((r) => r.name !== "Charlie"), "no responder is the creator");
assert(ov.responders[0].name === "Sam" && ov.responders[0].outcome === "win", "more-wins responder beat the creator (outcome=win)");
assert(ov.responders[0].winsMargin === 2, "responder wins margin is responder minus creator");
assert(ov.responders[1].name === "Lo" && ov.responders[1].outcome === "loss", "fewer-wins responder lost to the creator (outcome=loss)");
assert(ov.creator.rank === 2 && ov.total === 3, "creator rank + total reflect the board");
assert(ov.creator.players.length === 5 && ov.responders[0].players.length === 5, "fives resolve to 5 slot-labelled players");
assert(ov.creator.players[0].slot === "PG" && ov.creator.players[4].slot === "C", "fives are slot-labelled in PG..C order");
assert(ov.responders[0].resultUrl === "/r/f,g,h,i,j", "responder result permalink is /r/<ids>");
assert(ov.creator.resultUrl === "/r/a,b,c,d,e", "creator result permalink omits the hint stamp when not hinted");
// a net-rating-only edge: same wins, creator higher net -> responder loses on the tiebreak
const ovTie = buildOwnerView("x", cInfo, [{ uid: "u_t", name: "Ty", wins: 70, losses: 12, net: 5.9, lineup: "f,g,h,i,j", rank: 2 }], 2, getPlayer);
assert(ovTie.responders[0].outcome === "loss" && ovTie.responders[0].winsMargin === 0, "wins-tie decided on net -> loss with 0 wins margin");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL CHALLENGE CHECKS PASSED");
process.exit(fail ? 1 : 0);
