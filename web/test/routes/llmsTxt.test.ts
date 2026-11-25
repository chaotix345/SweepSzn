import { describe, it, expect } from "vitest";
import * as route from "@/app/llms.txt/route";
import { getEngineMeta } from "@/lib/receipts";
import { baseUrl } from "@/lib/site";
import { VS_MATCHUPS } from "@/lib/vs";

describe("GET /llms.txt", () => {
  it("is prerendered at build", () => {
    expect(route.dynamic).toBe("force-static");
  });

  it("serves plain-text markdown with an H1, a summary blockquote and absolute page links", async () => {
    const res = route.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const text = await res.text();
    expect(text.startsWith("# SweepSzn\n\n> ")).toBe(true);
    for (const p of ["/play", "/how-it-works", "/about", "/teams", "/vs", "/leaderboards"]) {
      expect(text).toContain(`](${baseUrl}${p})`);
    }
    for (const m of VS_MATCHUPS) expect(text).toContain(`${baseUrl}/vs/${m.slug}`);
  });

  it("lists every game mode, Draft Duel included", async () => {
    const text = await route.GET().text();
    for (const m of ["Daily", "Classic", "HoopIQ", "Prime Draft", "Factor Hunt", "Blueprint", "Surgeon", "Challenge a Friend", "Draft Duel"]) {
      expect(text).toContain(`- ${m}: `);
    }
  });

  it("quotes the engine's numbers from coefficients.json, not hand-typed copies", async () => {
    const m = getEngineMeta();
    const text = await route.GET().text();
    expect(text).toContain(`${m.team_seasons.toLocaleString("en-US")} real NBA team-seasons`);
    expect(text).toContain(`about ${m.cv_wins_rmse.toFixed(1)} wins`);
    expect(text).toContain("80-2");
    expect(text).toMatch(/### Can a team go 82-0\?/);
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
  });
});
