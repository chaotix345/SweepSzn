import { newChallengeId, challengeSeed, compareResults } from "./challenge";

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

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL CHALLENGE CHECKS PASSED");
process.exit(fail ? 1 : 0);
