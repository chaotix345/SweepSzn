import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, exhaustRateLimit, flushAfter } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();

// Freeze Date (only — timers stay real) mid-day UTC so a CI run straddling UTC midnight can't
// flake the day-key assertions: dayUTC() here and in the route see the same day.
vi.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), toFake: ["Date"] });

const { POST } = await import("@/app/api/ev/route");
const { EV_TTL } = await import("@/lib/evServer");

// dayUTC() returns YYYY-MM-DD for today UTC — we replicate its logic here so assertions match.
function dayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

// The route fires its bump() inside after(), so the counter writes are deferred until the response
// is sent. flushAfter() runs the queued tasks; the helper flushes so the write-assertion tests below
// observe the effects, exactly as production does post-response.
const post = async (body: unknown) => {
  const res = await POST(req("/api/ev", { body }));
  await flushAfter();
  return res;
};

beforeEach(() => { freshFake(); });

describe("POST /api/ev", () => {
  it("always returns 204", async () => {
    const res = await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    expect(res.status).toBe(204);
  });

  it("returns 204 before the beacon write is flushed (deferred via after())", async () => {
    // Call the route directly (not the flushing helper) to observe the pre-flush state.
    const res = await POST(req("/api/ev", { body: { ev: "play", uid: "user-deferred1", mode: "daily" } }));
    expect(res.status).toBe(204);
    const day = dayUTC();
    // the counter write is queued in after(), not yet executed
    expect(ctx.redis!.strings.has(`ev:play:${day}`)).toBe(false);
    // once the after() tasks run, the write lands
    await flushAfter();
    expect(Number(ctx.redis!.strings.get(`ev:play:${day}`))).toBe(1);
  });

  it("returns 204 for a non-JSON body (fire-and-forget, never throws)", async () => {
    const res = await POST(req("/api/ev", { rawBody: "not json", method: "POST" }));
    expect(res.status).toBe(204);
  });

  it("returns 204 for a malformed body — missing ev field", async () => {
    const res = await post({ uid: "user-abc00001" });
    expect(res.status).toBe(204);
  });

  it("returns 204 for an invalid ev value", async () => {
    const res = await post({ ev: "complete", uid: "user-abc00001" });
    expect(res.status).toBe(204);
  });

  it("returns 204 for a null body", async () => {
    const res = await post(null);
    expect(res.status).toBe(204);
  });

  it("increments ev:<stage>:<day> counter for a valid play beacon", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    const day = dayUTC();
    const counter = ctx.redis!.strings.get(`ev:play:${day}`);
    expect(Number(counter)).toBe(1);
  });

  it("increments ev:totals hash for a valid play beacon", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    const total = ctx.redis!.hashes.get("ev:totals")?.get("play");
    expect(Number(total)).toBe(1);
  });

  it("accumulates multiple play beacons", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    await post({ ev: "play", uid: "user-def00002", mode: "classic" });
    const day = dayUTC();
    const counter = ctx.redis!.strings.get(`ev:play:${day}`);
    expect(Number(counter)).toBe(2);
    const total = ctx.redis!.hashes.get("ev:totals")?.get("play");
    expect(Number(total)).toBe(2);
  });

  it("increments ev:<stage>:<day> counter for a valid share beacon", async () => {
    await post({ ev: "share", uid: "user-abc00001" });
    const day = dayUTC();
    const counter = ctx.redis!.strings.get(`ev:share:${day}`);
    expect(Number(counter)).toBe(1);
  });

  it("increments mode counter for play beacon with a valid mode", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    const day = dayUTC();
    const modeVal = ctx.redis!.hashes.get(`ev:mode:${day}`)?.get("daily");
    expect(Number(modeVal)).toBe(1);
  });

  it("does NOT write a mode counter for an invalid mode string", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "invalid-mode" });
    const day = dayUTC();
    expect(ctx.redis!.hashes.has(`ev:mode:${day}`)).toBe(false);
  });

  it("does NOT write a mode counter for a share beacon even with a mode field", async () => {
    await post({ ev: "share", uid: "user-abc00001", mode: "daily" });
    const day = dayUTC();
    expect(ctx.redis!.hashes.has(`ev:mode:${day}`)).toBe(false);
  });

  it("adds uid to ev:active:<day> set for a play beacon with valid uid", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    const day = dayUTC();
    const activeSet = ctx.redis!.sets.get(`ev:active:${day}`);
    expect(activeSet?.has("user-abc00001")).toBe(true);
  });

  it("adds uid to ev:active:<day> set for a share beacon with valid uid", async () => {
    await post({ ev: "share", uid: "user-abc00001" });
    const day = dayUTC();
    const activeSet = ctx.redis!.sets.get(`ev:active:${day}`);
    expect(activeSet?.has("user-abc00001")).toBe(true);
  });

  it("does NOT add uid to active set when uid is absent", async () => {
    await post({ ev: "play", mode: "daily" });
    const day = dayUTC();
    expect(ctx.redis!.sets.has(`ev:active:${day}`)).toBe(false);
  });

  it("does NOT add uid to active set when uid is invalid format", async () => {
    await post({ ev: "play", uid: "bad uid!", mode: "daily" });
    const day = dayUTC();
    // The uid is stripped by parseEvBody, so no uid is passed to bump
    expect(ctx.redis!.sets.has(`ev:active:${day}`)).toBe(false);
  });

  it("sets the EV_TTL on the daily counter key", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    const day = dayUTC();
    const ttl = ctx.redis!.ttls.get(`ev:play:${day}`);
    expect(ttl).toBe(EV_TTL);
  });

  it("sets the EV_TTL on the mode hash key for play beacons", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "hoopiq" });
    const day = dayUTC();
    const ttl = ctx.redis!.ttls.get(`ev:mode:${day}`);
    expect(ttl).toBe(EV_TTL);
  });

  it("sets the EV_TTL on the active set key", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    const day = dayUTC();
    const ttl = ctx.redis!.ttls.get(`ev:active:${day}`);
    expect(ttl).toBe(EV_TTL);
  });

  it("does not write ev:totals as an expired key (persistent)", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    expect(ctx.redis!.ttls.has("ev:totals")).toBe(false);
  });

  it("malformed bodies drop silently: no Redis keys written", async () => {
    await post({ ev: "signin" }); // signin is not a valid beacon ev
    await post({});
    await POST(req("/api/ev", { rawBody: "{not json}", method: "POST" }));
    await flushAfter();
    const day = dayUTC();
    expect(ctx.redis!.strings.has(`ev:play:${day}`)).toBe(false);
    expect(ctx.redis!.strings.has(`ev:share:${day}`)).toBe(false);
    expect(ctx.redis!.strings.has(`ev:signin:${day}`)).toBe(false);
  });

  it("handles all valid modes for play beacons", async () => {
    const modes = ["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime"];
    for (const mode of modes) {
      freshFake();
      const res = await post({ ev: "play", uid: `user-abc0000${modes.indexOf(mode)}`, mode });
      expect(res.status).toBe(204);
      const day = dayUTC();
      const modeVal = ctx.redis!.hashes.get(`ev:mode:${day}`)?.get(mode);
      expect(Number(modeVal)).toBe(1);
    }
  });

  it("silently drops (204, no write) once the per-IP bucket is exhausted — the beacon contract never exposes outcomes", async () => {
    exhaustRateLimit("rl:ev:9.9.9.9", 60);
    const res = await POST(req("/api/ev", { body: { ev: "play", uid: "user-abc00099", mode: "daily" }, ip: "9.9.9.9" }));
    await flushAfter();
    expect(res.status).toBe(204);
    expect(ctx.redis!.strings.has(`ev:play:${dayUTC()}`)).toBe(false);
  });

  it("writes the ev:src:first_play:<day> source hash for a first_play beacon with a valid source", async () => {
    await post({ ev: "first_play", uid: "user-abc00001", source: "x_launch" });
    const day = dayUTC();
    expect(Number(ctx.redis!.hashes.get(`ev:src:first_play:${day}`)?.get("x_launch"))).toBe(1);
  });

  it("does NOT write a source hash when the source is uppercase (rejected end-to-end by parseEvBody)", async () => {
    await post({ ev: "first_play", uid: "user-abc00001", source: "X_Launch" });
    const day = dayUTC();
    expect(ctx.redis!.hashes.has(`ev:src:first_play:${day}`)).toBe(false);
  });

  it("does NOT write a source hash for a non-acquisition stage (play) even with a valid source", async () => {
    await post({ ev: "play", uid: "user-abc00001", mode: "daily", source: "x_launch" });
    const day = dayUTC();
    expect(ctx.redis!.hashes.has(`ev:src:play:${day}`)).toBe(false);
  });

  // --- sign-in nudge stages (claim_nudge_shown / claim_nudge_tap), mode-tagged ---

  it("increments ev:claim_nudge_shown:<day> for a valid claim_nudge_shown beacon", async () => {
    await post({ ev: "claim_nudge_shown", mode: "classic" });
    const day = dayUTC();
    expect(Number(ctx.redis!.strings.get(`ev:claim_nudge_shown:${day}`))).toBe(1);
  });

  it("increments ev:claim_nudge_tap:<day> for a valid claim_nudge_tap beacon", async () => {
    await post({ ev: "claim_nudge_tap", mode: "surgeon" });
    const day = dayUTC();
    expect(Number(ctx.redis!.strings.get(`ev:claim_nudge_tap:${day}`))).toBe(1);
  });

  it("increments ev:totals for the nudge stages (persistent, never expired)", async () => {
    await post({ ev: "claim_nudge_shown", mode: "classic" });
    await post({ ev: "claim_nudge_tap", mode: "classic" });
    expect(Number(ctx.redis!.hashes.get("ev:totals")?.get("claim_nudge_shown"))).toBe(1);
    expect(Number(ctx.redis!.hashes.get("ev:totals")?.get("claim_nudge_tap"))).toBe(1);
    expect(ctx.redis!.ttls.has("ev:totals")).toBe(false);
  });

  it("writes the ev:nudge:claim_nudge_shown:<day> hash split by mode", async () => {
    await post({ ev: "claim_nudge_shown", mode: "hoopiq" });
    const day = dayUTC();
    expect(Number(ctx.redis!.hashes.get(`ev:nudge:claim_nudge_shown:${day}`)?.get("hoopiq"))).toBe(1);
    expect(ctx.redis!.ttls.get(`ev:nudge:claim_nudge_shown:${day}`)).toBe(EV_TTL);
  });

  it("writes the ev:nudge:claim_nudge_tap:<day> hash split by mode", async () => {
    await post({ ev: "claim_nudge_tap", mode: "blueprint" });
    const day = dayUTC();
    expect(Number(ctx.redis!.hashes.get(`ev:nudge:claim_nudge_tap:${day}`)?.get("blueprint"))).toBe(1);
  });

  it("does NOT write a nudge mode hash when the mode is absent", async () => {
    await post({ ev: "claim_nudge_shown" });
    const day = dayUTC();
    expect(ctx.redis!.hashes.has(`ev:nudge:claim_nudge_shown:${day}`)).toBe(false);
  });

  it("does NOT write a nudge mode hash for an invalid mode", async () => {
    await post({ ev: "claim_nudge_tap", mode: "not-a-mode" });
    const day = dayUTC();
    expect(ctx.redis!.hashes.has(`ev:nudge:claim_nudge_tap:${day}`)).toBe(false);
  });

  it("never conflates nudge stages with the play mode hash (ev:mode stays play-only)", async () => {
    await post({ ev: "claim_nudge_shown", mode: "classic" });
    const day = dayUTC();
    expect(ctx.redis!.hashes.has(`ev:mode:${day}`)).toBe(false);
  });

  it("does NOT add a uid to the active set for a nudge stage (seeing a nudge is not an engaged action)", async () => {
    await post({ ev: "claim_nudge_tap", uid: "user-abc00001", mode: "classic" });
    const day = dayUTC();
    expect(ctx.redis!.sets.has(`ev:active:${day}`)).toBe(false);
  });
});
