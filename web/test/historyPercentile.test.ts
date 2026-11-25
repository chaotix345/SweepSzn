import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { HISTORY_PACE, historyPaceFrom, historyRank, historyPercentileText } from "@/lib/historyPercentile";

const lookup = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "team_lookup.json"), "utf-8"));
const rows = Object.values(lookup) as { year: number; w: number | null; l: number | null }[];

describe("history pace data (D7)", () => {
  it("is exactly the 1,170 team-seasons 1985–2025 with a W-L, sorted (regenerate: npx tsx scripts/emit_history_pace.ts)", () => {
    expect(HISTORY_PACE).toEqual(historyPaceFrom(rows));
    expect(HISTORY_PACE).toHaveLength(1170);
    for (let i = 1; i < HISTORY_PACE.length; i++) expect(HISTORY_PACE[i]).toBeGreaterThanOrEqual(HISTORY_PACE[i - 1]);
  });

  it("paces shortened seasons to 82 games", () => {
    expect(historyPaceFrom([{ year: 1999, w: 25, l: 25 }])).toEqual([41]); // a 50-game .500 team
    expect(historyPaceFrom([{ year: 2012, w: 50, l: 16 }])).toEqual([62.12]);
    expect(historyPaceFrom([{ year: 1984, w: 60, l: 22 }, { year: 2026, w: 60, l: 22 }, { year: 2000, w: null, l: null }])).toEqual([]);
  });

  it("rounding never manufactures a tie with a whole-win projection", () => {
    for (const p of HISTORY_PACE) if (p !== Math.round(p)) expect(Math.abs(p - Math.round(p))).toBeGreaterThan(0.005);
  });
});

describe("historyRank", () => {
  const pace = [10, 20, 41, 41, 60];
  it("counts teams below fully and ties as half, floored", () => {
    expect(historyRank(41, pace).pct).toBe(Math.floor((100 * (2 + 1)) / 5)); // 60
    expect(historyRank(42, pace).pct).toBe(80);
    expect(historyRank(15, pace).pct).toBe(20);
    expect(historyRank(10, pace).pct).toBe(10); // tie with the worst counts half
  });

  it("flags beating every team / no team", () => {
    expect(historyRank(61, pace)).toMatchObject({ beatsAll: true, pct: 100 });
    expect(historyRank(60, pace).beatsAll).toBe(false);
    expect(historyRank(9, pace)).toMatchObject({ beatsNone: true, pct: 0 });
  });

  it("on the real data: 73-9 ties the Warriors (99%), 74+ beats everyone, 41 sits mid-pack", () => {
    expect(historyRank(73).pct).toBe(99);
    expect(historyRank(74).beatsAll).toBe(true);
    expect(historyRank(41).pct).toBeGreaterThan(40);
    expect(historyRank(41).pct).toBeLessThan(60);
  });
});

describe("historyPercentileText", () => {
  it("reads as a percentile, never 100%", () => {
    expect(historyPercentileText(55)).toMatch(/^Beats \d{1,2}% of real NBA teams since 1985$/);
    expect(historyPercentileText(80)).toBe("Better than every real team since 1985");
    expect(historyPercentileText(5)).toBe("Worse than every real team since 1985");
    expect(historyPercentileText(73)).toBe("Top 1% of real NBA teams since 1985");
    expect(historyPercentileText(67)).toBe("Top 1% of real NBA teams since 1985");
    expect(historyPercentileText(10)).toBe("Below nearly every real NBA team since 1985");
  });
});

describe("the /r/ OG card carries the history line", () => {
  it("renders the percentile beside the comparable team", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { resultOgElement } = await import("@/lib/og");
    const { PLAYERS, COEFF } = await import("./engineData");
    const { evaluateLineup } = await import("@/lib/engine");
    const five = PLAYERS.slice(0, 5);
    const r = evaluateLineup(five, COEFF);
    const html = renderToStaticMarkup(resultOgElement({ ...r, wins: 57, losses: 25 }, five));
    expect(html).toContain(`Beats ${historyRank(57).pct}% of real NBA teams since 1985`);
    expect(html).toContain("comparable to the 58-24 Spurs (2012-13)");
    expect(renderToStaticMarkup(resultOgElement({ ...r, wins: 81, losses: 1 }, five))).toContain("Better than every real team since 1985");
  });
});
