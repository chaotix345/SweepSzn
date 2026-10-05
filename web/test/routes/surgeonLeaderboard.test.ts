import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  ctx,
  req,
  readJson,
  exhaustRateLimit,
  authEnv,
} from "@/test/routeHarness";
import type { SurgeonRow } from "@/lib/surgeon";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// Leaderboard is redis-gated: enableRedisEnv must run before the route is imported.
enableRedisEnv();
authEnv();

const { GET, POST } = await import("@/app/api/surgeon/leaderboard/route");
// the personalized read: uid in the POST body, never the URL
const post = (body: unknown, ip = "9.9.9.9") => POST(req("/api/surgeon/leaderboard", { body, ip }));

const DATE = "2026-6-10";

const get = (qs: string, ip = "9.9.9.9") =>
  GET(req(`/api/surgeon/leaderboard?${qs}`, { ip }));

const keyZ = (d: string) => `lb:surgeon:${d}`;
const keyH = (d: string) => `lb:surgeon:${d}:meta`;

// Seed a surgeon board row directly into the fake Redis store.
function seedRow(date: string, uid: string, row: SurgeonRow, sortScore: number) {
  if (!ctx.redis!.zsets.has(keyZ(date))) ctx.redis!.zsets.set(keyZ(date), new Map());
  ctx.redis!.zsets.get(keyZ(date))!.set(uid, sortScore);
  if (!ctx.redis!.hashes.has(keyH(date))) ctx.redis!.hashes.set(keyH(date), new Map());
  ctx.redis!.hashes.get(keyH(date))!.set(uid, JSON.stringify(row));
}

beforeEach(() => { freshFake(); });

// ---------- guard rails / disabled gate ----------
describe("GET /api/surgeon/leaderboard — guard rails", () => {
  it.todo(
    "returns 503 when isSurgeonBoardEnabled() is false — cannot be exercised here without vi.resetModules() because the redis singleton is bound at module eval",
  );

  it("rejects a missing date param with 400", async () => {
    const { status } = await readJson(await get("uid=abcdefgh"));
    expect(status).toBe(400);
  });

  it("rejects a malformed date with 400", async () => {
    const { status } = await readJson(await get("date=notadate"));
    expect(status).toBe(400);
  });

  it("rejects a date with no digits pattern with 400", async () => {
    const { status } = await readJson(await get("date=2026-6-"));
    expect(status).toBe(400);
  });

  it("a junk uid query param is ignored, not a 400 (GET never reads a uid)", async () => {
    // GET is the public read and ignores any uid param (personalized reads POST it), so a stale
    // client's junk value can't break the board.
    const { status } = await readJson(await get(`date=${DATE}&uid=bad uid!!!`));
    expect(status).toBe(200);
  });

  it("rate limits with 429 after 60 calls", async () => {
    exhaustRateLimit("rl:sgboard:9.9.9.9", 60);
    const { status } = await readJson(await get(`date=${DATE}`, "9.9.9.9"));
    expect(status).toBe(429);
  });
});

// ---------- empty board ----------
describe("GET /api/surgeon/leaderboard — empty board", () => {
  it("returns an empty view for a fresh date", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
    expect(body).toMatchObject({ date: DATE, total: 0, top: [] });
    expect(body.you).toBeUndefined();
  });

  it("you is absent when uid is provided but not on the board", async () => {
    const { status, body } = await readJson(await post({ date: DATE, uid: "abcdefgh12" }));
    expect(status).toBe(200);
    expect(body.you).toBeUndefined();
  });
});

// ---------- single-row board ----------
describe("GET /api/surgeon/leaderboard — single row", () => {
  it("returns the row in top[] with rank=1 after one entry is seeded", async () => {
    const row: SurgeonRow = {
      uid: "userabc123", name: "Alice", delta: 5,
      beforeWins: 52, afterWins: 57, net: 5.0, card: "a,b,c,d,e.1.f",
    };
    seedRow(DATE, "userabc123", row, 105_005);

    const { status, body } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    const top = body.top as Record<string, unknown>[];
    expect(top.length).toBe(1);
    expect(top[0].uid).toBeUndefined(); // rows never carry a uid (H2)
    expect(top[0].name).toBe("Alice");
    expect(top[0].rank).toBe(1);
  });

  it("'you' matches the top entry when the uid is in the board", async () => {
    const row: SurgeonRow = {
      uid: "userabc123", name: "Alice", delta: 5,
      beforeWins: 52, afterWins: 57, net: 5.0, card: "a,b,c,d,e.1.f",
    };
    seedRow(DATE, "userabc123", row, 105_005);

    const { body } = await readJson(await post({ date: DATE, uid: "userabc123" }));
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.uid).toBeUndefined();
    expect(you?.me).toBe(true);
    expect(you?.name).toBe("Alice");
    expect(you?.rank).toBe(1);
  });
});

// ---------- rank ordering ----------
describe("GET /api/surgeon/leaderboard — rank ordering", () => {
  it("ranks by sortScore descending (higher delta+tiebreak = rank 1)", async () => {
    const makeRow = (uid: string, delta: number): SurgeonRow => ({
      uid, name: uid, delta, beforeWins: 50, afterWins: 50 + delta, net: 4.0, card: "a,b,c,d,e.0.z",
    });
    // score encoding: encSurgeonScore(delta, net) = (delta+100)*1000 + clamp(net+100, 0, 999)
    // Higher delta → higher score → better rank
    seedRow(DATE, "lowater0001", makeRow("lowater0001", 2), 102_104);
    seedRow(DATE, "midrange001", makeRow("midrange001", 5), 105_104);
    seedRow(DATE, "highscore01", makeRow("highscore01", 10), 110_104);

    const { body } = await readJson(await get(`date=${DATE}`));
    const top = body.top as Record<string, unknown>[];
    expect(top.length).toBe(3);
    expect(top[0].name).toBe("highscore01");
    expect(top[0].rank).toBe(1);
    expect(top[1].name).toBe("midrange001");
    expect(top[1].rank).toBe(2);
    expect(top[2].name).toBe("lowater0001");
    expect(top[2].rank).toBe(3);
  });

  it("returns total matching the number of seeded entries", async () => {
    for (let i = 1; i <= 5; i++) {
      const uid = `ranktst${i.toString().padStart(4, "0")}`;
      seedRow(DATE, uid, { uid, name: uid, delta: i, beforeWins: 50, afterWins: 50 + i, net: 4, card: "a,b,c,d,e.0.z" }, i * 1000);
    }
    const { body } = await readJson(await get(`date=${DATE}`));
    expect(body.total).toBe(5);
  });
});

// ---------- you outside top 100 ----------
describe("GET /api/surgeon/leaderboard — you outside top 100", () => {
  it("returns you with correct rank when uid is beyond top 100", async () => {
    // seed 100 high-scoring users
    for (let i = 1; i <= 100; i++) {
      const uid = `topuser${i.toString().padStart(3, "0")}`;
      seedRow(DATE, uid, { uid, name: `U${i}`, delta: i, beforeWins: 50, afterWins: 50 + i, net: 4, card: "a,b,c,d,e.0.z" }, 1000 + i);
    }
    // the 101st user with the lowest score (below all of 1001..1100)
    const uid101 = "outlierusr01";
    seedRow(DATE, uid101, { uid: uid101, name: "Outlier", delta: -3, beforeWins: 60, afterWins: 57, net: 3, card: "a,b,c,d,e.0.z" }, 500);

    const { body } = await readJson(await post({ date: DATE, uid: uid101 }));
    expect(body.total).toBe(101);
    expect((body.top as unknown[]).length).toBe(100);
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.uid).toBeUndefined();
    expect(you?.name).toBe("Outlier");
    expect(you?.me).toBe(true);
    expect(you?.rank).toBe(101);
  });
});

// ---------- response row shape ----------
describe("GET /api/surgeon/leaderboard — response row shape", () => {
  it("top rows contain name, delta, beforeWins, afterWins, net, card, rank — and no uid", async () => {
    const row: SurgeonRow = {
      uid: "shapetest01", name: "Shaper", delta: 3,
      beforeWins: 54, afterWins: 57, net: 4.5, card: "a,b,c,d,e.2.g",
    };
    seedRow(DATE, "shapetest01", row, 103_104);

    const { body } = await readJson(await get(`date=${DATE}`));
    const r = (body.top as Record<string, unknown>[])[0];
    expect(r.uid).toBeUndefined();
    expect(r.name).toBe("Shaper");
    expect(r.delta).toBe(3);
    expect(r.beforeWins).toBe(54);
    expect(r.afterWins).toBe(57);
    expect(typeof r.rank).toBe("number");
  });
});

// H2: no board response may carry a uid (bearer token — DESIGN.md §12); the caller's row is `me`.
describe("surgeon leaderboard — no uids on the wire", () => {
  const UIDS = ["sg-alice-1234", "sg-bob-12345", "sg-carol-1234"];
  const mine = (uid: string) => post({ date: DATE, uid });

  it("strips every uid and marks only the caller's row with me: true (top + you)", async () => {
    UIDS.forEach((u, i) => seedRow(DATE, u, {
      uid: u, name: `P${i}`, delta: 5 - i, beforeWins: 50, afterWins: 55 - i, net: 1, card: "a,b,c,d,e.1.f",
    }, 105_000 - i * 1000));
    const { status, body } = await readJson(await mine(UIDS[1]));
    expect(status).toBe(200);
    const wire = JSON.stringify(body);
    for (const u of UIDS) expect(wire).not.toContain(u);
    const top = body.top as Array<{ name: string; me?: boolean }>;
    expect(top.filter((r) => r.me).map((r) => r.name)).toEqual(["P1"]);
    expect(body.you).toMatchObject({ name: "P1", rank: 2, me: true });
  });
});

// M2: the anon uid must never ride a URL (DESIGN.md §12). Personalized reads POST it in the body;
// GET is the public, CDN-cached read and ignores any uid query param.
describe("surgeon leaderboard — personalized reads are POST-only", () => {
  const UIDS = ["sg-alice-1234", "sg-bob-12345"];
  const seed = () => UIDS.forEach((u, i) => seedRow(DATE, u, {
    uid: u, name: `P${i}`, delta: 5 - i, beforeWins: 50, afterWins: 55 - i, net: 1, card: "a,b,c,d,e.1.f",
  }, 105_000 - i * 1000));

  it("GET ignores a uid query param (no you, no me) and stays CDN-cacheable", async () => {
    seed();
    const res = await get(`date=${DATE}&uid=${UIDS[1]}`);
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.you).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("\"me\"");
    expect(res.headers.get("cache-control")).toMatch(/s-maxage/);
  });

  it("POST returns you + me for the body uid and is never cached", async () => {
    seed();
    const res = await post({ date: DATE, uid: UIDS[1] });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.you).toMatchObject({ name: "P1", rank: 2, me: true });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("POST prefers the session uid over the body uid", async () => {
    const { signIn } = await import("@/test/routeHarness");
    seed();
    await signIn({ uid: UIDS[0], name: "P0" });
    const { body } = await readJson(await post({ date: DATE, uid: UIDS[1] }));
    expect(body.you).toMatchObject({ name: "P0", me: true });
  });

  it("POST without a session rejects a missing or Google-namespace uid", async () => {
    const { authedUid } = await import("@/lib/auth");
    expect((await readJson(await post({ date: DATE }))).status).toBe(400);
    expect((await readJson(await post({ date: DATE, uid: authedUid("123") }))).status).toBe(400);
  });

  it("POST rejects a bad date and shares the per-IP board bucket", async () => {
    expect((await readJson(await post({ date: "nope", uid: UIDS[0] }))).status).toBe(400);
    exhaustRateLimit("rl:sgboard:7.7.7.7", 60);
    expect((await readJson(await post({ date: DATE, uid: UIDS[0] }, "7.7.7.7"))).status).toBe(429);
  });
});
