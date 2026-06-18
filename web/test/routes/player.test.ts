import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/player/[id]/route");

const ID = "michael_jordan_chi_1980s_1988";
const get = (id: string, ip?: string) =>
  GET(req(`/api/player/${id}`, ip ? { ip } : undefined), { params: Promise.resolve({ id }) });

beforeEach(() => { freshFake(); });

describe("GET /api/player/[id] (dossier data)", () => {
  it("returns descriptive dossier data for a known player", async () => {
    const { status, body } = await readJson(await get(ID));
    expect(status).toBe(200);
    expect(body.id).toBe(ID);
    expect(typeof body.name).toBe("string");
    expect(typeof body.accoladeLine).toBe("string");
    expect((body.accoladeLine as string).length).toBeGreaterThan(0); // Jordan is accoladed
    expect(Array.isArray(body.journey)).toBe(true);
    expect((body.journey as unknown[]).length).toBeGreaterThan(0);
  });

  it("400 for a malformed id", async () => {
    expect((await readJson(await get("Bad ID!"))).status).toBe(400);
  });

  it("404 for an unknown id", async () => {
    expect((await readJson(await get("nobody_unknown_xyz_000"))).status).toBe(404);
  });

  it("429 when the per-IP bucket is exhausted", async () => {
    exhaustRateLimit("rl:player:1.2.3.4", 120);
    expect((await readJson(await get(ID, "1.2.3.4"))).status).toBe(429);
  });
});
