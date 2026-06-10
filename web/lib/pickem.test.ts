import { describe, it, expect } from "vitest";
import {
  PICKEM_THRESHOLD, pickemSeedOk, parseVote, pickemVerdict, pickemShareLine,
  encodePickemCard, decodePickemCard,
} from "./pickem";

// --- seed gate (vote API must not mint arbitrary Redis keys) ---
describe("pickemSeedOk", () => {
  it("daily seed accepted", () => {
    expect(pickemSeedOk("daily-2026-6-10")).toBe(true);
  });
  it("classic seed accepted", () => {
    expect(pickemSeedOk("classic-123456789")).toBe(true);
  });
  it("hoopiq seed accepted", () => {
    expect(pickemSeedOk("hoopiq-42")).toBe(true);
  });
  it("challenge seed rejected", () => {
    expect(pickemSeedOk("h2h-abc123")).toBe(false);
  });
  it("unknown prefix rejected", () => {
    expect(pickemSeedOk("prime-123")).toBe(false);
  });
  it("empty suffix rejected", () => {
    expect(pickemSeedOk("daily-")).toBe(false);
  });
  it("uppercase rejected (seeds are lowercase)", () => {
    expect(pickemSeedOk("DAILY-2026-6-10")).toBe(false);
  });
  it("over-long suffix rejected", () => {
    expect(pickemSeedOk(`classic-${"9".repeat(41)}`)).toBe(false);
  });
  it("bad charset rejected", () => {
    expect(pickemSeedOk("daily-2026_6_10")).toBe(false);
  });
  it("non-string rejected", () => {
    expect(pickemSeedOk(42)).toBe(false);
  });
});

// --- vote parsing ---
describe("parseVote", () => {
  it("y/n parse", () => {
    expect(parseVote("y") === "y" && parseVote("n") === "n").toBe(true);
  });
  it("junk votes rejected", () => {
    expect(parseVote("Y") === null && parseVote("yes") === null && parseVote(1) === null && parseVote(null) === null).toBe(true);
  });
});

// --- verdict: threshold boundary ("more than 60") ---
describe("pickemVerdict - threshold", () => {
  it("threshold is 60 (calibrated for crowd error)", () => {
    expect(PICKEM_THRESHOLD).toBe(60);
  });
  it("exactly 60 wins does NOT crack 60", () => {
    expect(pickemVerdict(60, { y: 5, n: 1, vote: null }).hit).toBe(false);
  });
  it("61 wins cracks 60", () => {
    expect(pickemVerdict(61, { y: 5, n: 1, vote: null }).hit).toBe(true);
  });
});

// --- verdict: crowd math ---
describe("pickemVerdict - crowd math", () => {
  it("majority yes at 73%", () => {
    const v = pickemVerdict(67, { y: 73, n: 27, vote: null });
    expect(v.crowd === "y" && v.pct === 73).toBe(true);
  });
  it("crowd right when yes-majority and 67 wins", () => {
    const v = pickemVerdict(67, { y: 73, n: 27, vote: null });
    expect(v.crowdRight).toBe(true);
  });
  it("no vote -> youRight null", () => {
    const v = pickemVerdict(67, { y: 73, n: 27, vote: null });
    expect(v.youRight).toBe(null);
  });

  it("crowd wrong when yes-majority but 45 wins", () => {
    const v = pickemVerdict(45, { y: 68, n: 32, vote: "n" });
    expect(v.crowdRight).toBe(false);
  });
  it("voting no against a yes-majority and flopping = defied", () => {
    const v = pickemVerdict(45, { y: 68, n: 32, vote: "n" });
    expect(v.youRight === true && v.defied).toBe(true);
  });

  it("yes vote against a no-majority that hit = defied at 68%", () => {
    const v = pickemVerdict(67, { y: 32, n: 68, vote: "y" });
    expect(v.defied && v.pct === 68).toBe(true);
  });

  it("voting WITH the majority is never defied", () => {
    const v = pickemVerdict(67, { y: 70, n: 30, vote: "y" });
    expect(!v.defied && v.youRight === true).toBe(true);
  });

  it("defied requires being right", () => {
    const v = pickemVerdict(67, { y: 30, n: 70, vote: "y" });
    expect(v.defied).toBe(true);
  });
  it("wrong against the majority is not defied", () => {
    const w = pickemVerdict(45, { y: 30, n: 70, vote: "y" });
    expect(w.defied === false && w.youRight === false).toBe(true);
  });

  it("no votes -> no crowd", () => {
    expect(pickemVerdict(67, { y: 0, n: 0, vote: null }).crowd).toBe(null);
  });
  it("tie -> no crowd", () => {
    expect(pickemVerdict(67, { y: 4, n: 4, vote: "y" }).crowd).toBe(null);
  });
  it("tie -> crowdRight null", () => {
    expect(pickemVerdict(67, { y: 4, n: 4, vote: "y" }).crowdRight).toBe(null);
  });

  it("your own vote alone is a self-prediction (solo), never defied", () => {
    const v = pickemVerdict(67, { y: 1, n: 0, vote: "y" });
    expect(v.solo && !v.defied).toBe(true);
  });
  it("solo requires a vote", () => {
    expect(pickemVerdict(67, { y: 50, n: 50, vote: null }).solo).toBe(false);
  });
  it("negative counts clamped", () => {
    expect(pickemVerdict(67, { y: -3, n: 2, vote: null }).total).toBe(2);
  });
});

// --- share line: only the defy story rewrites share text ---
describe("pickemShareLine", () => {
  it("defied-hit share line", () => {
    const line = pickemShareLine(67, 15, { y: 32, n: 68, vote: "y" }, "the 1970s Knicks");
    expect(line).toBe("I defied the crowd — 67-15 on the 1970s Knicks when 68% said they'd flop.");
  });
  it("defied-miss share line", () => {
    const line = pickemShareLine(45, 37, { y: 68, n: 32, vote: "n" }, "the 2000s Lakers");
    expect(line).toBe("I called the flop — 45-37 on the 2000s Lakers when 68% said 60+ wins was a lock.");
  });
  it("null subject falls back", () => {
    expect(pickemShareLine(67, 15, { y: 32, n: 68, vote: "y" }, null)).toBe("I defied the crowd — 67-15 on today's spin when 68% said they'd flop.");
  });
  it("with-the-crowd -> standard share text", () => {
    expect(pickemShareLine(67, 15, { y: 70, n: 30, vote: "y" }, "x")).toBe(null);
  });
  it("solo vote -> standard share text", () => {
    expect(pickemShareLine(67, 15, { y: 0, n: 0, vote: "y" }, "x")).toBe(null);
  });
  it("no vote -> standard share text", () => {
    expect(pickemShareLine(67, 15, { y: 30, n: 70, vote: null }, "x")).toBe(null);
  });
});

// --- /pe/<card> encode/decode round-trip ---
const LU = "a1,b2,c3,d4,e5";

describe("encodePickemCard / decodePickemCard", () => {
  it("card encoding shape", () => {
    const enc = encodePickemCard(LU, { y: 73, n: 27, vote: "y" });
    expect(enc).toBe(`73.27.y.${LU}`);
  });
  it("round-trip", () => {
    const enc = encodePickemCard(LU, { y: 73, n: 27, vote: "y" });
    const dec = decodePickemCard(enc);
    expect(!!dec && dec.lineup === LU && dec.view.y === 73 && dec.view.n === 27 && dec.view.vote === "y").toBe(true);
  });
  it("hinted lineup + skipped vote round-trip", () => {
    const dec = decodePickemCard(encodePickemCard(`h~${LU}`, { y: 0, n: 0, vote: null }));
    expect(!!dec && dec.lineup === `h~${LU}` && dec.view.vote === null).toBe(true);
  });
  it("still-URL-encoded segment tolerated", () => {
    expect(decodePickemCard(encodeURIComponent(`1.2.n.${LU}`))).not.toBe(null);
  });
  it("wrong part count rejected", () => {
    expect(decodePickemCard(`1.2.n.${LU}.extra`)).toBe(null);
  });
  it("bad vote flag rejected", () => {
    expect(decodePickemCard(`1.2.z.${LU}`)).toBe(null);
  });
  it("negative count rejected", () => {
    expect(decodePickemCard(`-1.2.y.${LU}`)).toBe(null);
  });
  it("non-integer count rejected (extra dot also breaks shape)", () => {
    expect(decodePickemCard(`1.5.2.y.${LU}`)).toBe(null);
  });
  it("absurd count rejected", () => {
    expect(decodePickemCard(`${"9".repeat(12)}.2.y.${LU}`)).toBe(null);
  });
  it("4-player lineup rejected", () => {
    expect(decodePickemCard("1.2.y.a1,b2,c3,d4")).toBe(null);
  });
  it("bad lineup charset rejected", () => {
    expect(decodePickemCard("1.2.y.a1;b2,c3,d4,e5")).toBe(null);
  });
  it("empty segment rejected", () => {
    expect(decodePickemCard("")).toBe(null);
  });
});
