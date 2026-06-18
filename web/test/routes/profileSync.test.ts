import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, signIn, flushAfter } from "@/test/routeHarness";
import { dayUTC } from "@/lib/day";
import { encodeLineup } from "@/lib/share";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
vi.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), toFake: ["Date"] });

const { POST } = await import("@/app/api/profile/sync/route");
const { getNotifs } = await import("@/lib/notifyStore");

const FIVE = [
  "michael_jordan_chi_1980s_1988",
  "lebron_james_cle_2000s_2009",
  "david_robinson_sas_1990s_1994",
  "nikola_joki_den_2020s_2024",
  "kevin_garnett_min_2000s_2004",
];

const post = (body: unknown, headers?: Record<string, string>) =>
  POST(req("/api/profile/sync", { method: "POST", body, headers: { "x-requested-with": "fetch", ...headers } }));

const UID = "g" + "a".repeat(31);

beforeEach(() => { freshFake(); });

describe("POST /api/profile/sync", () => {
  it("403 without the CSRF header", async () => {
    await signIn({ uid: UID, name: "X" });
    const { status } = await readJson(await POST(req("/api/profile/sync", { method: "POST", body: {} })));
    expect(status).toBe(403);
  });

  it("401 when signed out", async () => {
    const { status, body } = await readJson(await post({ history: ["2026-6-15"] }));
    expect(status).toBe(401);
    expect(body.error).toBe("auth_required");
  });

  it("unions local completed-daily dates into the account streak and reports the consecutive run", async () => {
    await signIn({ uid: UID, name: "X" });
    const { status, body } = await readJson(await post({ history: ["2026-6-15", "2026-6-14", "2026-6-13"] }));
    expect(status).toBe(200);
    expect(body.streak).toBe(3);
    expect(ctx.redis!.zsets.get(`streak:${UID}`)!.size).toBe(3);
  });

  it("re-canonicalizes a zero-padded date so it doesn't create a duplicate member", async () => {
    await signIn({ uid: UID, name: "X" });
    await post({ history: ["2026-6-15"] });
    await post({ history: ["2026-06-15"] }); // padded form of the same day
    expect(ctx.redis!.zsets.get(`streak:${UID}`)!.size).toBe(1);
  });

  it("is idempotent — re-syncing the same data adds nothing", async () => {
    await signIn({ uid: UID, name: "X" });
    const first = await readJson(await post({ results: [{ encoded: "aaa", mode: "daily", wins: 50, losses: 32, grade: "B", ts: 100 }] }));
    expect(first.body.results).toBe(1);
    const second = await readJson(await post({ results: [{ encoded: "aaa", mode: "daily", wins: 50, losses: 32, grade: "B", ts: 100 }] }));
    expect(second.body.results).toBe(0);
    expect(ctx.redis!.lists.get(`results:${UID}`)!.length).toBe(1);
  });

  it("merges + dedupes result history by mode:encoded and returns the fresh count", async () => {
    await signIn({ uid: UID, name: "X" });
    const r1 = await readJson(await post({ results: [
      { encoded: "aaa", mode: "daily", wins: 50, losses: 32, grade: "B", ts: 100 },
      { encoded: "bbb", mode: "classic", wins: 60, losses: 22, grade: "A", ts: 200 },
    ] }));
    expect(r1.body.results).toBe(2);
    const r2 = await readJson(await post({ results: [
      { encoded: "aaa", mode: "daily", wins: 50, losses: 32, grade: "B", ts: 100 }, // dupe
      { encoded: "ccc", mode: "hoopiq", wins: 70, losses: 12, grade: "A", ts: 300 }, // new
    ] }));
    expect(r2.body.results).toBe(1);
    expect(ctx.redis!.lists.get(`results:${UID}`)!.length).toBe(3);
  });

  it("drops entries with an unknown mode at the trust boundary", async () => {
    await signIn({ uid: UID, name: "X" });
    const { body } = await readJson(await post({ results: [
      { encoded: "x1", mode: "totally-fake", wins: 1, losses: 1, grade: "F", ts: 1 },
      { encoded: "x2", mode: "daily", wins: 1, losses: 1, grade: "F", ts: 1 },
    ] }));
    expect(body.results).toBe(1);
  });

  it("bounds the history batch to 400 dates", async () => {
    await signIn({ uid: UID, name: "X" });
    const base = Date.UTC(2010, 0, 1);
    const many = Array.from({ length: 500 }, (_, i) => dayUTC(new Date(base + i * 86_400_000)));
    await post({ history: many });
    expect(ctx.redis!.zsets.get(`streak:${UID}`)!.size).toBe(400);
  });

  // Drafted Dex badge-unlock notifications (post-commit, descriptive — §12).
  it("records the badge snapshot but does NOT ping on the first sync (no backfill spam)", async () => {
    await signIn({ uid: UID, name: "X" });
    await post({ results: [{ encoded: encodeLineup(FIVE), mode: "daily", wins: 50, losses: 32, grade: "B", ts: 100 }] });
    await flushAfter();
    expect((await getNotifs(UID)).items.length).toBe(0);
    expect(ctx.redis!.sets.get(`badges:${UID}`)?.size ?? 0).toBeGreaterThan(0); // snapshot stored
  });

  it("pings when a later sync newly unlocks a badge", async () => {
    await signIn({ uid: UID, name: "X" });
    await post({ results: [{ encoded: encodeLineup(FIVE), mode: "daily", wins: 50, losses: 32, grade: "B", ts: 100 }] });
    await flushAfter(); // snapshot stored, no ping
    await post({ results: [{ encoded: encodeLineup(FIVE), mode: "classic", wins: 80, losses: 2, grade: "S", ts: 200 }] });
    await flushAfter();
    const inbox = (await getNotifs(UID)).items;
    expect(inbox.length).toBeGreaterThan(0);
    expect(inbox[0].type).toBe("badge_unlock");
    expect(inbox[0].type === "badge_unlock" && inbox[0].badge).toBe("sTier");
  });
});
