import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, signIn, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
// Freeze Date so the server-computed streak is deterministic across a UTC-midnight CI run.
vi.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), toFake: ["Date"] });

const { GET } = await import("@/app/api/profile/route");

const get = () => GET(req("/api/profile"));

function seedStreak(uid: string, dates: string[]) {
  const k = `streak:${uid}`;
  if (!ctx.redis!.zsets.has(k)) ctx.redis!.zsets.set(k, new Map());
  dates.forEach((d, i) => ctx.redis!.zsets.get(k)!.set(d, i));
}
function seedResults(uid: string, entries: unknown[]) {
  ctx.redis!.lists.set(`results:${uid}`, entries.map((e) => JSON.stringify(e)));
}
function seedProfileName(uid: string, name: string) {
  const k = `profile:${uid}`;
  if (!ctx.redis!.hashes.has(k)) ctx.redis!.hashes.set(k, new Map());
  ctx.redis!.hashes.get(k)!.set("name", name);
}

beforeEach(() => { freshFake(); });

describe("GET /api/profile", () => {
  it("401 auth_required when signed out", async () => {
    const { status, body } = await readJson(await get());
    expect(status).toBe(401);
    expect(body.error).toBe("auth_required");
  });

  it("429 once the per-IP rate-limit bucket is exhausted", async () => {
    exhaustRateLimit("rl:profile:1.2.3.4", 60);
    const { status } = await readJson(await GET(req("/api/profile", { ip: "1.2.3.4" })));
    expect(status).toBe(429);
  });

  it("never CDN-cached (private, no-store)", async () => {
    await signIn({ uid: "g" + "a".repeat(31), name: "Alice" });
    const res = await get();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns the merged account state — custom handle, server streak, result history", async () => {
    const uid = "g" + "a".repeat(31);
    await signIn({ uid, name: "Google Name", picture: "http://pic" });
    seedStreak(uid, ["2026-6-15", "2026-6-14"]);
    seedResults(uid, [{ encoded: "x", mode: "daily", wins: 50, losses: 32, grade: "B", ts: 1 }]);
    seedProfileName(uid, "CourtVision");
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body.name).toBe("CourtVision");
    expect(body.streak).toBe(2);
    expect((body.results as unknown[]).length).toBe(1);
  });

  it("falls back to the Google session name when no custom handle is stored", async () => {
    const uid = "g" + "b".repeat(31);
    await signIn({ uid, name: "Google Name" });
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body.name).toBe("Google Name");
    expect(body.streak).toBe(0);
    expect(body.results).toStrictEqual([]);
  });
});
