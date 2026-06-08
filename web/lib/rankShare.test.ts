import { encodeRankCard, decodeRankCard, type RankCard } from "./rankShare";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };
const rt = (c: RankCard) => decodeRankCard(encodeRankCard(c));
const eq = (a: RankCard, b: RankCard | null) => !!b && a.scope === b.scope && a.rank === b.rank && a.total === b.total &&
  a.wins === b.wins && a.losses === b.losses && Math.abs(a.net - b.net) < 1e-9 && a.name === b.name;

const daily: RankCard = { scope: "daily", rank: 3, total: 1280, name: "Charlie", wins: 78, losses: 4, net: 23.4 };
const week: RankCard = { scope: "week", rank: 12, total: 540, name: "Dončić", wins: 412, losses: 0, net: 0 };
const alltime: RankCard = { scope: "alltime", rank: 48, total: 9001, name: "A.J. O'Neal-Smith", wins: 3847, losses: 0, net: 0 };
const negnet: RankCard = { scope: "daily", rank: 999, total: 1000, name: "tank", wins: 12, losses: 70, net: -8.6 };

assert(eq(daily, rt(daily)), "daily card round-trips");
assert(eq(week, rt(week)), "weekly card round-trips (unicode name)");
assert(eq(alltime, rt(alltime)), "alltime card round-trips (dots/apostrophe in name)");
assert(eq(negnet, rt(negnet)), "negative net round-trips");

// segment is URL-path safe (only base64url chars + dots + minus)
assert(/^[A-Za-z0-9._-]+$/.test(encodeRankCard(alltime)), "encoded segment is path-safe");

// garbage -> null
assert(decodeRankCard("garbage") === null, "non-7-field segment -> null");
assert(decodeRankCard("z.1.2.3.4.5.bm9wZQ") === null, "unknown scope code -> null");
assert(decodeRankCard("d.x.2.3.4.5.bm9wZQ") === null, "non-numeric field -> null");

console.log(fail ? `\n${fail} RANKSHARE ASSERTION(S) FAILED` : "\nALL RANKSHARE CHECKS PASSED");
process.exit(fail ? 1 : 0);
