import { describe, it, expect } from "vitest";
import { encodeRankCard, decodeRankCard, type RankCard } from "./rankShare";

const rt = (c: RankCard) => decodeRankCard(encodeRankCard(c));
const eq = (a: RankCard, b: RankCard | null) => !!b && a.scope === b.scope && a.rank === b.rank && a.total === b.total &&
  a.wins === b.wins && a.losses === b.losses && Math.abs(a.net - b.net) < 1e-9 && a.name === b.name;

const daily: RankCard = { scope: "daily", rank: 3, total: 1280, name: "Charlie", wins: 78, losses: 4, net: 23.4 };
const week: RankCard = { scope: "week", rank: 12, total: 540, name: "Dončić", wins: 412, losses: 0, net: 0 };
const alltime: RankCard = { scope: "alltime", rank: 48, total: 9001, name: "A.J. O'Neal-Smith", wins: 3847, losses: 0, net: 0 };
const negnet: RankCard = { scope: "daily", rank: 999, total: 1000, name: "tank", wins: 12, losses: 70, net: -8.6 };

describe("rankShare", () => {
  it("daily card round-trips", () => {
    expect(eq(daily, rt(daily))).toBe(true);
  });

  it("weekly card round-trips (unicode name)", () => {
    expect(eq(week, rt(week))).toBe(true);
  });

  it("alltime card round-trips (dots/apostrophe in name)", () => {
    expect(eq(alltime, rt(alltime))).toBe(true);
  });

  it("negative net round-trips", () => {
    expect(eq(negnet, rt(negnet))).toBe(true);
  });

  // segment is URL-path safe (only base64url chars + dots + minus)
  it("encoded segment is path-safe", () => {
    expect(/^[A-Za-z0-9._-]+$/.test(encodeRankCard(alltime))).toBe(true);
  });

  // garbage -> null
  it("non-7-field segment -> null", () => {
    expect(decodeRankCard("garbage")).toBe(null);
  });

  it("unknown scope code -> null", () => {
    expect(decodeRankCard("z.1.2.3.4.5.bm9wZQ")).toBe(null);
  });

  it("non-numeric field -> null", () => {
    expect(decodeRankCard("d.x.2.3.4.5.bm9wZQ")).toBe(null);
  });
});

// Crafted /rank/<card> URLs used to render nonsense ("#1e+300 of 1e+300", 300-char names).
describe("rankShare — decode rejects out-of-range cards", () => {
  const card = (over: Partial<RankCard>) => encodeRankCard({ ...daily, ...over });
  it("rejects non-integer / astronomic / out-of-order ranks", () => {
    expect(decodeRankCard(card({ rank: 1e300, total: 1e300 }))).toBe(null);
    expect(decodeRankCard("d.25e-1.1280.78.4.234.bm9wZQ")).toBe(null); // rank 2.5 isn't an integer
    expect(decodeRankCard(card({ rank: 0 }))).toBe(null);
    expect(decodeRankCard(card({ rank: 1281, total: 1280 }))).toBe(null);
  });

  it("bounds a daily record to one 82-game season and |net| < 100", () => {
    expect(decodeRankCard(card({ wins: 83, losses: 0 }))).toBe(null);
    expect(decodeRankCard(card({ wins: 10, losses: -1 }))).toBe(null);
    expect(decodeRankCard(card({ net: 100 }))).toBe(null);
    expect(decodeRankCard(card({ net: -100 }))).toBe(null);
    expect(eq({ ...daily, wins: 82, losses: 0, net: 99.9 }, decodeRankCard(card({ wins: 82, losses: 0, net: 99.9 })))).toBe(true);
  });

  it("bounds cumulative wins per scope (a week is at most 7 games' worth)", () => {
    expect(decodeRankCard(encodeRankCard({ ...week, wins: 82 * 7 + 1 }))).toBe(null);
    expect(decodeRankCard(encodeRankCard({ ...week, wins: -5 }))).toBe(null);
    expect(eq(alltime, decodeRankCard(encodeRankCard(alltime)))).toBe(true);
  });

  it("caps the decoded display name like cleanName", () => {
    expect(decodeRankCard(card({ name: "x".repeat(300) }))!.name.length).toBeLessThanOrEqual(24);
  });
});
