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
