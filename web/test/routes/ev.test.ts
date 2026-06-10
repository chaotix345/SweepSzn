import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req } from "@/test/routeHarness";

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

const post = (body: unknown) => POST(req("/api/ev", { body }));

beforeEach(() => { freshFake(); });

describe("POST /api/ev", () => {
  it("always returns 204", async () => {
    const res = await post({ ev: "play", uid: "user-abc00001", mode: "daily" });
    expect(res.status).toBe(204);
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
});
