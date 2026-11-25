import { describe, it, expect } from "vitest";
import { createRedisFake } from "./redisFake";
import { rescoreProfileResults, rescoreChallenge, rescoreBoard, archiveBoard, type RescoreRedis } from "../lib/rescore";
import { encScore } from "../lib/score";
import type { LineupResult } from "../lib/types";

const IDS = ["a1", "b2", "c3", "d4", "e5"];
const result = (wins: number, net: number): LineupResult => ({
  ortg: 110, drtg: 110 - net, netRtg: net, wins, losses: 82 - wins, winPct: wins / 82,
  grade: wins >= 57 ? "B" : "C", label: "", factors: [], players: [], notes: [],
});
// new engine: every five is worth 60-22, except the creator's, which is 70-12
const evaluate = (ids: string[]) => (ids[0] === "z9" ? result(70, 15.2) : result(60, 7.4));

function fake() {
  return createRedisFake() as unknown as RescoreRedis & ReturnType<typeof createRedisFake>;
}

describe("rescoreProfileResults", () => {
  it("rewrites wins/losses/grade from the stored lineup and keeps order", async () => {
    const r = fake();
    await r.lpush("results:u1",
      { encoded: IDS.join(","), mode: "classic", wins: 41, losses: 41, grade: "D", ts: 1 },
      { encoded: "a1,b2,c3,d4,e5.2.f6", mode: "surgeon", wins: 50, losses: 32, grade: "C", ts: 2 });
    const changed = await rescoreProfileResults(r, "u1", evaluate);
    expect(changed).toBe(2);
    const after = await r.lrange<{ ts: number; wins: number; grade: string }>("results:u1", 0, -1);
    expect(after.map((e) => e.ts)).toEqual([2, 1]);
    expect(after.every((e) => e.wins === 60 && e.grade === "B")).toBe(true);
    expect(await rescoreProfileResults(r, "u1", evaluate)).toBe(0);
    expect(await r.get("results:lock:u1")).toBeNull(); // released
  });

  it("does not touch a history whose sync lock another writer holds", async () => {
    const r = fake();
    await r.lpush("results:u2", { encoded: IDS.join(","), mode: "classic", wins: 41, losses: 41, grade: "D", ts: 1 });
    await r.set("results:lock:u2", "someone-else", { nx: true, ex: 5 });
    expect(await rescoreProfileResults(r, "u2", evaluate)).toBe(-1);
    expect((await r.lrange<{ wins: number }>("results:u2", 0, -1))[0].wins).toBe(41);
    expect(await r.get("results:lock:u2")).toBe("someone-else");
  });
});

describe("rescoreChallenge", () => {
  it("rescored creator info and board rows; ZSET order follows the new scores", async () => {
    const r = fake();
    await r.set("chal:abc123:info", { uid: "c", name: "C", wins: 50, losses: 32, net: 3, grade: "C", lineup: "z9,b2,c3,d4,e5", seed: "s", hinted: false });
    await r.hset("chal:abc123:meta", {
      c: { uid: "c", name: "C", wins: 50, losses: 32, net: 3, lineup: "z9,b2,c3,d4,e5" },
      f: { uid: "f", name: "F", wins: 65, losses: 17, net: 10, lineup: IDS.join(",") },
    });
    await r.zadd("chal:abc123", { score: encScore(50, 3), member: "c" }, { score: encScore(65, 10), member: "f" });
    expect(await rescoreChallenge(r, "abc123", evaluate, 100)).toBe(true);
    const info = await r.get<{ wins: number }>("chal:abc123:info");
    expect(info!.wins).toBe(70);
    const order = await r.zrange<string[]>("chal:abc123", 0, -1);
    expect(order.map(String)).toEqual(["f", "c"]); // ascending: f (60) below c (70)
    expect(await rescoreChallenge(r, "abc123", evaluate, 100)).toBe(false);
    for (const k of ["chal:abc123", "chal:abc123:meta", "chal:abc123:info"]) expect(r.ttls.get(k)).toBe(100);
  });
});

describe("archiveBoard", () => {
  it("renames the all-time board under :v3 atomically and only once", async () => {
    const r = fake();
    await r.zadd("lb:alltime", { score: 120, member: "u1" }, { score: 80, member: "u2" });
    await r.hset("lb:alltime:meta", { u1: { uid: "u1", name: "A", wins: 120 } });
    expect(await archiveBoard(r, "lb:alltime", "lb:alltime:meta", 3)).toBe(true);
    expect(await r.zrange<unknown[]>("lb:alltime", 0, -1)).toEqual([]);
    expect(await r.zrange<unknown[]>("lb:alltime:v3", 0, -1, { withScores: true })).toEqual(["u2", 80, "u1", 120]);
    expect(await r.hgetall("lb:alltime:meta:v3")).toEqual({ u1: { uid: "u1", name: "A", wins: 120 } });
    await r.zadd("lb:alltime", { score: 5, member: "u3" });
    expect(await archiveBoard(r, "lb:alltime", "lb:alltime:meta", 3)).toBe(false);
    expect(await r.zrange<unknown[]>("lb:alltime", 0, -1)).toEqual(["u3"]);
  });

  it("gives an archived weekly board the weekly TTL, and skips a board that doesn't exist", async () => {
    const r = fake();
    await r.zadd("lb:week:2026-W48", { score: 50, member: "u1" });
    expect(await archiveBoard(r, "lb:week:2026-W48", "lb:week:2026-W48:meta", 3, 3024000)).toBe(true);
    expect(r.ttls.get("lb:week:2026-W48:v3")).toBe(3024000);
    expect(await archiveBoard(r, "lb:week:2026-W49", "lb:week:2026-W49:meta", 3, 3024000)).toBe(false);
  });
});

describe("rescoreBoard (today's daily board)", () => {
  it("rescores rows that carry a lineup and skips rows that don't", async () => {
    const r = fake();
    await r.hset("lb:2026-11-25:meta", {
      u1: { uid: "u1", name: "A", wins: 41, losses: 41, net: 0, lineup: IDS.join(",") },
      u2: { uid: "u2", name: "B", wins: 50, losses: 32, net: 2 },
    });
    await r.zadd("lb:2026-11-25", { score: encScore(41, 0), member: "u1" }, { score: encScore(50, 2), member: "u2" });
    expect(await rescoreBoard(r, "lb:2026-11-25", "lb:2026-11-25:meta", evaluate)).toBe(1);
    const z = await r.zrange<(string | number)[]>("lb:2026-11-25", 0, -1, { withScores: true });
    expect(z).toEqual(["u2", encScore(50, 2), "u1", encScore(60, 7.4)]);
    expect(await rescoreBoard(r, "lb:2026-11-25", "lb:2026-11-25:meta", evaluate)).toBe(0);
  });
});
