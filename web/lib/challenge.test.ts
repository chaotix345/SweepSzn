import { describe, it, expect } from "vitest";
import { newChallengeId, challengeSeed, compareResults, buildOwnerView } from "./challenge";

// newChallengeId: 8 chars, [a-z0-9], comma-free, won't collide with the daily seed format
describe("newChallengeId", () => {
  const ids = Array.from({ length: 2000 }, () => newChallengeId());

  it("id is 8 chars of [a-z0-9]", () => {
    expect(ids.every((id) => /^[a-z0-9]{8}$/.test(id))).toBe(true);
  });

  it("id is comma-free", () => {
    expect(ids.every((id) => !id.includes(","))).toBe(true);
  });

  it("ids are unique across 2000 mints", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// challengeSeed
describe("challengeSeed", () => {
  it("seed is h2h-<id>", () => {
    expect(challengeSeed("abc12345")).toBe("h2h-abc12345");
  });

  it("challenge seed never collides with daily- seeds", () => {
    expect(challengeSeed("abc12345").startsWith("daily-")).toBe(false);
  });
});

// compareResults: winner by wins, tiebreak netRtg, else tie
describe("compareResults", () => {
  it("more wins wins (a)", () => {
    expect(compareResults({ wins: 80, netRtg: 10 }, { wins: 78, netRtg: 20 }).winner).toBe("a");
  });

  it("more wins wins (b)", () => {
    expect(compareResults({ wins: 70, netRtg: 5 }, { wins: 75, netRtg: 1 }).winner).toBe("b");
  });

  it("wins tie -> higher netRtg wins (a)", () => {
    expect(compareResults({ wins: 70, netRtg: 8.4 }, { wins: 70, netRtg: 8.1 }).winner).toBe("a");
  });

  it("wins tie -> higher netRtg wins (b)", () => {
    expect(compareResults({ wins: 70, netRtg: 8.1 }, { wins: 70, netRtg: 8.4 }).winner).toBe("b");
  });

  it("exact tie -> tie", () => {
    expect(compareResults({ wins: 70, netRtg: 8.0 }, { wins: 70, netRtg: 8.0 }).winner).toBe("tie");
  });

  it("margins are a minus b", () => {
    const m = compareResults({ wins: 80, netRtg: 12.5 }, { wins: 78, netRtg: 9.5 });
    expect(m.winsMargin === 2 && Math.abs(m.netMargin - 3) < 1e-9).toBe(true);
  });
});

// buildOwnerView: creator dashboard assembly
describe("buildOwnerView", () => {
  const getPlayer = (id: string) => ({ id, name: id.toUpperCase(), team: "LAL", decade: "2010" });
  const cInfo = { uid: "u_creator", name: "Charlie", wins: 70, losses: 12, net: 6.0, grade: "A", lineup: "a,b,c,d,e", hinted: false };
  const rows = [
    { uid: "u_friend", name: "Sam", wins: 72, losses: 10, net: 5.0, lineup: "f,g,h,i,j", rank: 1 },
    { uid: "u_creator", name: "Charlie", wins: 70, losses: 12, net: 6.0, lineup: "a,b,c,d,e", rank: 2 },
    { uid: "u_lo", name: "Lo", wins: 68, losses: 14, net: 4.0, lineup: "k,l,m,n,o", rank: 3 },
  ];
  const ov = buildOwnerView("abc12345", cInfo, rows, 3, getPlayer);

  it("creator is excluded from their own responder list", () => {
    expect(ov.responders.length).toBe(2);
  });

  it("no responder is the creator", () => {
    expect(ov.responders.every((r) => r.name !== "Charlie")).toBe(true);
  });

  it("more-wins responder beat the creator (outcome=win)", () => {
    expect(ov.responders[0].name === "Sam" && ov.responders[0].outcome === "win").toBe(true);
  });

  it("responder wins margin is responder minus creator", () => {
    expect(ov.responders[0].winsMargin).toBe(2);
  });

  it("fewer-wins responder lost to the creator (outcome=loss)", () => {
    expect(ov.responders[1].name === "Lo" && ov.responders[1].outcome === "loss").toBe(true);
  });

  it("creator rank + total reflect the board", () => {
    expect(ov.creator.rank === 2 && ov.total === 3).toBe(true);
  });

  it("fives resolve to 5 slot-labelled players", () => {
    expect(ov.creator.players.length === 5 && ov.responders[0].players.length === 5).toBe(true);
  });

  it("fives are slot-labelled in PG..C order", () => {
    expect(ov.creator.players[0].slot === "PG" && ov.creator.players[4].slot === "C").toBe(true);
  });

  it("responder result permalink is /r/<ids>", () => {
    expect(ov.responders[0].resultUrl).toBe("/r/f,g,h,i,j");
  });

  it("creator result permalink omits the hint stamp when not hinted", () => {
    expect(ov.creator.resultUrl).toBe("/r/a,b,c,d,e");
  });

  // a net-rating-only edge: same wins, creator higher net -> responder loses on the tiebreak
  it("wins-tie decided on net -> loss with 0 wins margin", () => {
    const ovTie = buildOwnerView("x", cInfo, [{ uid: "u_t", name: "Ty", wins: 70, losses: 12, net: 5.9, lineup: "f,g,h,i,j", rank: 2 }], 2, getPlayer);
    expect(ovTie.responders[0].outcome === "loss" && ovTie.responders[0].winsMargin === 0).toBe(true);
  });
});
