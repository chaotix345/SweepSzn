import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, exhaustRateLimit, signIn } from "@/test/routeHarness";
import { encodeLineup } from "@/lib/share";
import { encodeSurgeonCard } from "@/lib/surgeon";
import { encodeDuelCard } from "@/lib/duel";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET, POST } = await import("@/app/api/dex/route");

const FIVE = [
  "michael_jordan_chi_1980s_1988",
  "lebron_james_cle_2000s_2009",
  "david_robinson_sas_1990s_1994",
  "nikola_joki_den_2020s_2024",
  "kevin_garnett_min_2000s_2004",
];
const result = (grade: string, mode = "classic") =>
  JSON.stringify({ encoded: encodeLineup(FIVE), mode, wins: 60, losses: 22, grade, ts: 1 });

beforeEach(() => { freshFake(); });

describe("GET /api/dex", () => {
  it("401 when not signed in", async () => {
    expect((await readJson(await GET(req("/api/dex")))).status).toBe(401);
  });

  it("returns the collected players, total, and badges for a signed-in user", async () => {
    await signIn({ uid: "user-dextester", name: "Dex" });
    ctx.redis!.lists.set("results:user-dextester", [result("S")]);
    const { status, body } = await readJson(await GET(req("/api/dex")));
    expect(status).toBe(200);
    expect(Array.isArray(body.players)).toBe(true);
    expect((body.players as unknown[]).length).toBe(5);
    expect(body.total).toBe(1);
    expect(body.badges).toContain("first");
    expect(body.badges).toContain("sTier"); // grade S in the result
  });

  it("dedupes the same player across multiple games", async () => {
    await signIn({ uid: "user-dextester2", name: "Dex2" });
    ctx.redis!.lists.set("results:user-dextester2", [result("F"), result("F", "daily")]);
    const { body } = await readJson(await GET(req("/api/dex")));
    expect((body.players as unknown[]).length).toBe(5); // same five, one set of cards
    expect(body.total).toBe(2);
  });

  it("a Surgeon card result counts the drafted five plus the swapped-in player", async () => {
    await signIn({ uid: "user-dexsurgeon", name: "S" });
    const IN = "wilt_chamberlain_sfw_1960s_1963";
    ctx.redis!.lists.set("results:user-dexsurgeon", [
      JSON.stringify({ encoded: encodeSurgeonCard(FIVE, 4, IN), mode: "surgeon", wins: 60, losses: 22, grade: "A", ts: 1 }),
    ]);
    const { body } = await readJson(await GET(req("/api/dex")));
    expect((body.players as { id: string }[]).map((p) => p.id).sort()).toEqual([...FIVE, IN].sort());
  });

  it("includes players from the unbounded dex set even when results are empty (past the cap)", async () => {
    await signIn({ uid: "user-dexonly", name: "U" });
    ctx.redis!.sets.set("dex:user-dexonly", new Set(FIVE));
    const { body } = await readJson(await GET(req("/api/dex")));
    expect((body.players as unknown[]).length).toBe(5); // from the dex set alone
    expect(body.total).toBe(0); // no result rows
  });

  it("429 when the per-IP bucket is exhausted", async () => {
    exhaustRateLimit("rl:dex:1.2.3.4", 60);
    expect((await readJson(await GET(req("/api/dex", { ip: "1.2.3.4" })))).status).toBe(429);
  });
});

// Local-first Dex: the client posts its localStorage result history (lib/resultHistory listResults),
// so the collection works signed out and merges with the account's server Dex when signed in.
const local = (grade: string, mode = "classic", ids = FIVE) => ({ encoded: encodeLineup(ids), mode, wins: 60, losses: 22, grade, ts: 1 });
const post = (body: unknown, ip?: string) => POST(req("/api/dex", { body, ip }));

describe("POST /api/dex (local-first)", () => {
  it("builds the Dex from local history when signed out — 200, never 401", async () => {
    const { status, body } = await readJson(await post({ results: [local("S")] }));
    expect(status).toBe(200);
    expect((body.players as unknown[]).length).toBe(5);
    expect(body.total).toBe(1);
    expect(body.badges).toContain("first");
    expect(body.badges).toContain("sTier");
    expect(body.signedIn).toBe(false);
  });

  it("returns an empty Dex (not an error) for a signed-out player with no history", async () => {
    const { status, body } = await readJson(await post({ results: [] }));
    expect(status).toBe(200);
    expect(body.players).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.badges).toEqual([]);
  });

  it("N03: counts a Draft Duel's own five (cards past 256 chars), never the bot's", async () => {
    const BOT = ["magic_johnson_lal_1980s_1990", "larry_bird_bos_1980s_1985", "hakeem_olajuwon_hou_1990s_1993", "tim_duncan_sas_2000s_2002", "stephen_curry_gsw_2010s_2016"];
    const card = encodeDuelCard("oldhead", FIVE, BOT);
    expect(card.length).toBeGreaterThan(256);
    const { body } = await readJson(await post({ results: [{ encoded: card, mode: "duel", grade: "A" }] }));
    expect((body.players as { id: string }[]).map((p) => p.id).sort()).toEqual([...FIVE].sort());
    expect(body.total).toBe(1);
    const { body: big } = await readJson(await post({ results: [{ encoded: "x".repeat(641), mode: "duel", grade: "A" }] }));
    expect(big.total).toBe(0);
  });

  it("decodes Surgeon cards from local history too (drafted five + the swapped-in player)", async () => {
    const IN = "wilt_chamberlain_sfw_1960s_1963";
    const { body } = await readJson(await post({ results: [{ encoded: encodeSurgeonCard(FIVE, 4, IN), mode: "surgeon", grade: "A" }] }));
    expect((body.players as { id: string }[]).map((p) => p.id).sort()).toEqual([...FIVE, IN].sort());
  });

  it("merges local history with the signed-in account's server Dex, deduping the same game", async () => {
    await signIn({ uid: "user-dexmerge", name: "M" });
    ctx.redis!.lists.set("results:user-dexmerge", [result("F")]);
    const IN = "wilt_chamberlain_sfw_1960s_1963";
    ctx.redis!.sets.set("dex:user-dexmerge", new Set([IN]));
    const other = ["michael_jordan_chi_1980s_1988", "lebron_james_cle_2000s_2009", "david_robinson_sas_1990s_1994", "nikola_joki_den_2020s_2024", "stephen_curry_gsw_2010s_2016"];
    const { body } = await readJson(await post({ results: [local("F"), local("A", "daily", other)] }));
    const ids = (body.players as { id: string }[]).map((p) => p.id).sort();
    expect(ids).toEqual([...new Set([...FIVE, IN, ...other])].sort());
    expect(body.total).toBe(2); // classic FIVE is the same game on both sides; the daily one is new
    expect(body.signedIn).toBe(true);
  });

  it("ignores malformed entries and unknown modes, and bounds the list", async () => {
    const junk = [null, 7, { encoded: 5, mode: "classic" }, { encoded: encodeLineup(FIVE), mode: "nope" }, { encoded: "x".repeat(300), mode: "classic" }];
    const { status, body } = await readJson(await post({ results: [...Array(100).fill(null), local("F")] }));
    expect(status).toBe(200);
    expect(body.total).toBe(0); // only the first 60 entries are read: the valid one past the cap is dropped
    const r2 = await readJson(await post({ results: [...junk, local("F")] }));
    expect(r2.body.total).toBe(1);
    expect((await readJson(await POST(req("/api/dex", { rawBody: "{not json" })))).status).toBe(200);
  });

  it("429 when the per-IP bucket is exhausted", async () => {
    exhaustRateLimit("rl:dex:5.6.7.8", 60);
    expect((await readJson(await post({ results: [] }, "5.6.7.8"))).status).toBe(429);
  });
});
