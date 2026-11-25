import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, req, readJson, exhaustRateLimit } from "@/test/routeHarness";
import { playDuelViaRoutes } from "@/test/duelHarness";
import { DUEL_TURNS } from "@/lib/duel";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { POST } = await import("@/app/api/duel/bot-pick/route");
const spinRoute = await import("@/app/api/spin/route");

const post = (body: unknown, ip = "1.2.3.4") => POST(req("/api/duel/bot-pick", { body, ip }));
const route = (path: string, body: unknown) => (path === "/api/spin" ? spinRoute.POST : POST)(req(path, { body, ip: "9.9.9.9" }));

beforeEach(() => { freshFake(); });

describe("POST /api/duel/bot-pick", () => {
  it("429s when the bucket is exhausted", async () => {
    exhaustRateLimit("rl:duel:1.2.3.4", 120);
    expect((await post({ seed: "duel-a1", persona: "bro", picks: [] })).status).toBe(429);
  });

  it("400s on a bad seed, persona or pick list", async () => {
    expect((await post({ seed: "classic-1", persona: "bro", picks: [] })).status).toBe(400);
    expect((await post({ seed: "duel-a1", persona: "goat", picks: [] })).status).toBe(400);
    expect((await post({ seed: "duel-a1", persona: "bro", picks: [{ id: "x", slot: "G" }] })).status).toBe(400);
  });

  it("with no picks it is your turn first: no bot picks yet", async () => {
    const { status, body } = await readJson(await post({ seed: "duel-a1", persona: "oldhead", picks: [] }));
    expect(status).toBe(200);
    expect(body).toEqual({ bot: [], next: 0 });
  });

  it("rejects a pick outside your deal (server validates against the seed)", async () => {
    const { status, body } = await readJson(await post({ seed: "duel-a1", persona: "bro", picks: [{ id: "not_a_real_player", slot: "PG" }] }));
    expect(status).toBe(400);
    expect(String(body.error)).toMatch(/in your spin/);
  });

  it("plays full duels for every persona: snake order, bot picks only, no fit or score data", async () => {
    for (const persona of ["bro", "oldhead", "analyst"] as const) {
      const { bot, picks } = await playDuelViaRoutes(route, `duel-route${persona}`, persona);
      expect(picks).toHaveLength(5);
      expect(bot.map((b) => b.turn)).toEqual(DUEL_TURNS.flatMap((s, t) => (s === "bot" ? [t] : [])));
      expect(new Set(bot.map((b) => b.slot)).size).toBe(5);
      for (const b of bot) {
        expect((b.player as unknown as Record<string, unknown>).fit).toBeUndefined();
        expect(Object.keys(b).sort()).toEqual(["decade", "fallback", "player", "round", "slot", "team", "turn"]);
      }
      expect(new Set([...picks.map((p) => p.id), ...bot.map((b) => b.player.id)]).size).toBe(10);
    }
  });
});
