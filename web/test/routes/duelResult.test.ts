import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, req, readJson, exhaustRateLimit, ctx } from "@/test/routeHarness";
import { playDuelViaRoutes } from "@/test/duelHarness";
import { decodeDuelCard } from "@/lib/duel";
import { compareResults } from "@/lib/challenge";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { POST } = await import("@/app/api/duel/result/route");
const botRoute = await import("@/app/api/duel/bot-pick/route");
const spinRoute = await import("@/app/api/spin/route");

const post = (body: unknown, ip = "1.2.3.4") => POST(req("/api/duel/result", { body, ip }));
const route = (path: string, body: unknown) => (path === "/api/spin" ? spinRoute.POST : botRoute.POST)(req(path, { body, ip: "9.9.9.9" }));

beforeEach(() => { freshFake(); });

type Side = { players: { id: string }[]; result: { wins: number; losses: number; netRtg: number; grade: string } };

describe("POST /api/duel/result", () => {
  it("429s when the bucket is exhausted", async () => {
    exhaustRateLimit("rl:duelres:1.2.3.4", 30);
    expect((await post({ seed: "duel-r1", persona: "bro", picks: [] })).status).toBe(429);
  });

  it("400s unless exactly five valid picks finish the duel", async () => {
    expect((await post({ seed: "duel-r1", persona: "bro", picks: [] })).status).toBe(400);
    const { picks } = await playDuelViaRoutes(route, "duel-r1", "bro");
    expect((await post({ seed: "duel-r1", persona: "bro", picks: picks.slice(0, 4) })).status).toBe(400);
    // the same picks under another seed: different deals, so the replay rejects them
    expect((await post({ seed: "duel-other", persona: "bro", picks })).status).toBe(400);
  });

  it("scores both fives, decides by record then net rating, and mints the permalink card", async () => {
    const { picks, bot } = await playDuelViaRoutes(route, "duel-r2", "analyst");
    const { status, body } = await readJson(await post({ seed: "duel-r2", persona: "analyst", picks }));
    expect(status).toBe(200);
    const you = body.you as Side, b = body.bot as Side;
    const w = compareResults(you.result, b.result).winner;
    expect(body.outcome).toBe(w === "a" ? "w" : w === "b" ? "l" : "t");
    const card = decodeDuelCard(String(body.card))!;
    expect(card.persona).toBe("analyst");
    expect(card.youIds).toEqual(you.players.map((p) => p.id));
    expect([...card.botIds].sort()).toEqual(bot.map((x) => x.player.id).sort());
  });

  it("writes nothing to Redis beyond its rate-limit bucket (no boards, no streaks)", async () => {
    const { picks } = await playDuelViaRoutes(route, "duel-r3", "oldhead");
    freshFake();
    expect((await post({ seed: "duel-r3", persona: "oldhead", picks })).status).toBe(200);
    const r = ctx.redis!;
    const keys = [r.strings, r.hashes, r.zsets, r.lists, r.sets].flatMap((m) => [...(m as Map<string, unknown>).keys()]);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith("rl:"))).toBe(true);
  });
});
