import { describe, it, expect } from "vitest";
import { flagLaggards, bucketWins } from "@/lib/metrics";

// flagLaggards turns the raw source/nudge splits into an at-a-glance "this is leaking" signal:
// it flags any channel/mode whose conversion rate sits far below the median of its peers, while
// ignoring tiny samples (so a single n=1 visit can't read as a "0% laggard").
describe("flagLaggards", () => {
  it("flags an entry whose rate is far below the peer median", () => {
    const flagged = flagLaggards([
      { key: "a", num: 50, den: 100 }, // 0.50
      { key: "b", num: 48, den: 100 }, // 0.48
      { key: "c", num: 2, den: 100 },  // 0.02 — laggard
    ]);
    expect(flagged.has("c")).toBe(true);
    expect(flagged.has("a")).toBe(false);
    expect(flagged.has("b")).toBe(false);
    expect(flagged.size).toBe(1);
  });

  it("ignores entries below the minimum-sample floor (no false alarm on tiny n)", () => {
    const flagged = flagLaggards([
      { key: "a", num: 50, den: 100 },
      { key: "b", num: 48, den: 100 },
      { key: "c", num: 0, den: 3 }, // den < minDen(5) → not eligible, never flagged
    ]);
    expect(flagged.has("c")).toBe(false);
    expect(flagged.size).toBe(0);
  });

  it("returns empty when there are fewer than two eligible entries to compare", () => {
    expect(flagLaggards([]).size).toBe(0);
    expect(flagLaggards([{ key: "a", num: 5, den: 100 }]).size).toBe(0);
    expect(flagLaggards([{ key: "a", num: 5, den: 100 }, { key: "b", num: 0, den: 2 }]).size).toBe(0);
  });

  it("returns empty when every eligible rate is the same", () => {
    const flagged = flagLaggards([
      { key: "a", num: 10, den: 100 },
      { key: "b", num: 10, den: 100 },
      { key: "c", num: 10, den: 100 },
    ]);
    expect(flagged.size).toBe(0);
  });

  it("honors a custom ratio threshold", () => {
    const entries = [
      { key: "a", num: 50, den: 100 }, // 0.50
      { key: "b", num: 50, den: 100 }, // 0.50
      { key: "c", num: 30, den: 100 }, // 0.30 — below 0.8*median(0.5)=0.4 but above 0.5*0.5=0.25
    ];
    expect(flagLaggards(entries).has("c")).toBe(false);            // default ratio 0.5 → not flagged
    expect(flagLaggards(entries, { ratio: 0.8 }).has("c")).toBe(true); // stricter → flagged
  });
});

// Guard the win-bucket boundaries (78-82, 70-77, 60-69, <60) — these label the leaderboard chart.
describe("bucketWins", () => {
  it("buckets wins at the band boundaries", () => {
    const by = Object.fromEntries(bucketWins([82, 78, 77, 70, 69, 60, 59, 0]).map(b => [b.label, b.count]));
    expect(by["78-82"]).toBe(2); // 82, 78
    expect(by["70-77"]).toBe(2); // 77, 70
    expect(by["60-69"]).toBe(2); // 69, 60
    expect(by["<60"]).toBe(2);   // 59, 0
  });
});
