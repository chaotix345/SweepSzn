import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, flushAfter } from "@/test/routeHarness";
import { dayUTC } from "@/lib/day";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { POST } = await import("@/app/api/evaluate/route");

// Five real player ids from players.json with distinct person_ids (uniqueness check).
const FIVE_IDS = [
  "michael_jordan_chi_1980s_1988",
  "lebron_james_cle_2000s_2009",
  "david_robinson_sas_1990s_1994",
  "nikola_joki_den_2020s_2024",
  "kevin_garnett_min_2000s_2004",
];

const post = (body: unknown) => POST(req("/api/evaluate", { body }));

beforeEach(() => { freshFake(); });

describe("POST /api/evaluate — input validation", () => {
  it("400 when ids array is missing", async () => {
    const { status, body } = await readJson(await post({}));
    expect(status).toBe(400);
    expect(typeof body.error).toBe("string");
  });

  it("400 when fewer than 5 ids provided", async () => {
    const { status } = await readJson(await post({ ids: ["a", "b", "c"] }));
    expect(status).toBe(400);
  });

  it("400 when more than 5 ids provided", async () => {
    const { status } = await readJson(await post({ ids: [...FIVE_IDS, "extra_player_id"] }));
    expect(status).toBe(400);
  });

  it("400 when ids contains invalid format (filtered out, leaving != 5)", async () => {
    const { status } = await readJson(await post({ ids: ["UPPER_CASE_BAD!", "has spaces bad", "ok_id_1", "ok_id_2", "ok_id_3"] }));
    expect(status).toBe(400);
  });

  it("400 when non-JSON body is sent", async () => {
    const { status } = await readJson(await POST(req("/api/evaluate", { rawBody: "not json", method: "POST" })));
    expect(status).toBe(400);
  });
});

describe("POST /api/evaluate — valid lineup", () => {
  it("200 with result and players when 5 known ids are submitted", async () => {
    const { status, body } = await readJson(await post({ ids: FIVE_IDS }));
    expect(status).toBe(200);
    expect(body).toHaveProperty("result");
    expect(body).toHaveProperty("players");
    expect(Array.isArray(body.players)).toBe(true);
    expect((body.players as unknown[]).length).toBe(5);
  });

  it("result has expected shape (wins, losses, grade, netRtg, ortg, drtg)", async () => {
    const { body } = await readJson(await post({ ids: FIVE_IDS }));
    const r = body.result as Record<string, unknown>;
    expect(typeof r.wins).toBe("number");
    expect(typeof r.losses).toBe("number");
    expect(typeof r.grade).toBe("string");
    expect(typeof r.netRtg).toBe("number");
    expect(typeof r.ortg).toBe("number");
    expect(typeof r.drtg).toBe("number");
  });

  it("wins + losses === 82", async () => {
    const { body } = await readJson(await post({ ids: FIVE_IDS }));
    const r = body.result as Record<string, unknown>;
    expect((r.wins as number) + (r.losses as number)).toBe(82);
  });
});

describe("POST /api/evaluate — after() ev:complete counter", () => {
  it("increments ev:complete counter in Redis after a valid request", async () => {
    await post({ ids: FIVE_IDS });
    await flushAfter();
    const day = dayUTC();
    const count = ctx.redis!.strings.get(`ev:complete:${day}`);
    expect(Number(count)).toBe(1);
  });

  it("increments totals hash for complete stage", async () => {
    await post({ ids: FIVE_IDS });
    await flushAfter();
    const total = ctx.redis!.hashes.get("ev:totals")?.get("complete");
    expect(Number(total)).toBe(1);
  });

  it("ev:complete counter does not increment on a 400 response", async () => {
    await post({ ids: [] });
    await flushAfter();
    const day = dayUTC();
    const count = ctx.redis!.strings.get(`ev:complete:${day}`);
    expect(count).toBeUndefined();
  });
});

describe("POST /api/evaluate — rate limit", () => {
  it.todo("should 429 when the rate limit bucket is exhausted — rate limiter is NOT present in the current route source (evaluate/route.ts has no rateLimit() call); this test documents that the advertised rate limit is missing");
});
