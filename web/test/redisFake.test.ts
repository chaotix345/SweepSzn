import { describe, expect, it } from "vitest";
import { createRedisFake } from "./redisFake";
import { KEEP_BEST_LUA, encScore } from "@/lib/score";
import { PICKEM_VOTE_LUA } from "@/lib/pickem";

// The KEEP_BEST_LUA walk-through mirrors scripts/lua_e2e.ts, whose assertions were verified
// against real Upstash — if the fake diverges from these, the fake is wrong, not the test.
describe("eval: KEEP_BEST_LUA port", () => {
  const fake = createRedisFake();
  const dz = "lb:t:daily";
  const wz = "lb:t:week";
  const az = "lb:t:alltime";
  const run = (uid: string, wins: number, net: number) =>
    fake.eval(KEEP_BEST_LUA, [dz, wz, az], [uid, encScore(wins, net), wins, 3600, 3600]) as Promise<
      [number, number, number, number]
    >;

  it("first submit: changed, delta=70, weekly=70, alltime=70", async () => {
    expect(await run("u1", 70, 4)).toEqual([1, 70, 70, 70]);
  });

  it("improve 70->75: delta=5, totals=75", async () => {
    expect(await run("u1", 75, 6)).toEqual([1, 5, 75, 75]);
  });

  it("worse score: no-op", async () => {
    expect(await run("u1", 72, 9)).toEqual([0, 0, 0, 0]);
  });

  it("re-submit equal: no-op, alltime stays 75 (idempotent)", async () => {
    const r = await run("u1", 75, 6);
    expect(r[0]).toBe(0);
    expect(Number(await fake.zscore(az, "u1"))).toBe(75);
  });

  it("net-only improve: changed, delta=0, weekly and alltime unchanged", async () => {
    expect(await run("u1", 75, 20)).toEqual([1, 0, 75, 75]);
  });

  it("fewer wins after a daily reset decrements the aggregates (negative delta)", async () => {
    const f = createRedisFake();
    const day1 = (uid: string, wins: number, net: number) =>
      f.eval(KEEP_BEST_LUA, ["d1", "w", "a"], [uid, encScore(wins, net), wins, 3600, 3600]);
    const day2 = (uid: string, wins: number, net: number) =>
      f.eval(KEEP_BEST_LUA, ["d2", "w", "a"], [uid, encScore(wins, net), wins, 3600, 3600]);
    await day1("u", 80, 5);
    expect(await day2("u", 60, 5)).toEqual([1, 60, 140, 140]);
    // worse-than-best replay on day1 with fewer wins: keep-best rejects, no decrement
    expect(await day1("u", 60, 5)).toEqual([0, 0, 0, 0]);
    expect(Number(await f.zscore("a", "u"))).toBe(140);
  });

  it("concurrent identical first-submits credit the delta once", async () => {
    await Promise.all(Array.from({ length: 8 }, () => run("u2", 60, 5)));
    expect(Number(await fake.zscore(az, "u2"))).toBe(60);
  });

  it("all-time ranks by wins", async () => {
    await run("u3", 82, 10);
    const top = (await fake.zrange(az, 0, -1, { rev: true })) as string[];
    expect(top[0]).toBe("u3");
    expect(top).toContain("u1");
    expect(top).toContain("u2");
  });

  it("sets the daily and weekly TTLs but never an all-time TTL", () => {
    expect(fake.ttls.get(dz)).toBe(3600);
    expect(fake.ttls.get(wz)).toBe(3600);
    expect(fake.ttls.has(az)).toBe(false);
  });
});

describe("eval: PICKEM_VOTE_LUA port", () => {
  const fake = createRedisFake();
  const keys = (voter: string) => [`pickems:s:voted:${voter}`, "pickems:s:y", "pickems:s:n"];
  const vote = (voter: string, v: "y" | "n") => fake.eval(PICKEM_VOTE_LUA, keys(voter), [v, 60]);

  it("first vote claims and counts", async () => {
    expect(await vote("a", "y")).toEqual([1, "y", 1, 0]);
  });

  it("flipped-vote replay returns the original pick without double-counting", async () => {
    expect(await vote("a", "n")).toEqual([0, "y", 1, 0]);
  });

  it("a second voter counts independently", async () => {
    expect(await vote("b", "n")).toEqual([1, "n", 1, 1]);
  });

  it("claims carry the TTL on voter marker and counter", () => {
    expect(fake.ttls.get("pickems:s:voted:a")).toBe(60);
    expect(fake.ttls.get("pickems:s:y")).toBe(60);
    expect(fake.ttls.get("pickems:s:n")).toBe(60);
  });

  it("throws on an unknown script", async () => {
    await expect(fake.eval("return 1", [], [])).rejects.toThrow(/unknown script/);
  });
});

describe("command surface semantics", () => {
  it("get/set round-trips objects via JSON and keeps the numeric-string asymmetry", async () => {
    const fake = createRedisFake();
    await fake.set("o", { a: 1 });
    expect(await fake.get("o")).toEqual({ a: 1 });
    await fake.set("s", "plain");
    expect(await fake.get("s")).toBe("plain");
    await fake.set("n", "5");
    expect(await fake.get("n")).toBe(5); // same asymmetry as the real client
    expect(await fake.get("missing")).toBeNull();
  });

  it("get of a stored empty string returns '' (factor-hunt locked skip), not null", async () => {
    const fake = createRedisFake();
    await fake.set("lock", "", { nx: true, ex: 60 });
    expect(await fake.get("lock")).toBe("");
  });

  it("set nx returns OK on claim, null when the key exists", async () => {
    const fake = createRedisFake();
    expect(await fake.set("k", "a", { nx: true, ex: 60 })).toBe("OK");
    expect(await fake.set("k", "b", { nx: true, ex: 60 })).toBeNull();
    expect(await fake.get("k")).toBe("a");
    expect(fake.ttls.get("k")).toBe(60);
  });

  it("mget returns one slot per key with nulls for misses", async () => {
    const fake = createRedisFake();
    await fake.incr("y");
    expect(await fake.mget("y", "n")).toEqual([1, null]);
  });

  it("zrange withScores returns the flat [member, score, ...] shape, rev included", async () => {
    const fake = createRedisFake();
    await fake.zadd("z", { score: 2, member: "b" }, { score: 1, member: "a" }, { score: 3, member: "c" });
    expect(await fake.zrange("z", 0, -1, { rev: true, withScores: true })).toEqual(["c", 3, "b", 2, "a", 1]);
    expect(await fake.zrange("z", 0, 1)).toEqual(["a", "b"]);
  });

  it("zrevrank ranks from the top; missing member is null", async () => {
    const fake = createRedisFake();
    await fake.zadd("z", { score: 1, member: "a" }, { score: 3, member: "c" });
    expect(await fake.zrevrank("z", "c")).toBe(0);
    expect(await fake.zrevrank("z", "a")).toBe(1);
    expect(await fake.zrevrank("z", "x")).toBeNull();
  });

  it("hset/hmget/hgetall JSON round-trip rows; hmget is null when every field misses", async () => {
    const fake = createRedisFake();
    const row = { uid: "u1", name: "Charlie", wins: 70 };
    await fake.hset("h", { u1: row });
    expect(await fake.hmget("h", "u1", "u2")).toEqual({ u1: row, u2: null }); // real client: missing fields present as null
    expect(await fake.hmget("h", "u2")).toBeNull();
    expect(await fake.hexists("h", "u1")).toBe(1);
    expect(await fake.hexists("h", "u2")).toBe(0);
    expect(await fake.hlen("h")).toBe(1);
    expect(await fake.hgetall("h")).toEqual({ u1: row });
    expect(await fake.hgetall("missing")).toBeNull();
    await fake.hdel("h", "u1");
    expect(await fake.hgetall("h")).toBeNull();
  });

  it("lpush puts the last value at the head; lrange/ltrim use inclusive Redis ranges", async () => {
    const fake = createRedisFake();
    await fake.lpush("l", "a", "b");
    await fake.lpush("l", "c");
    expect(await fake.lrange("l", 0, -1)).toEqual(["c", "b", "a"]);
    expect(await fake.lrange("l", 0, 0)).toEqual(["c"]);
    await fake.ltrim("l", 0, 1);
    expect(await fake.lrange("l", 0, -1)).toEqual(["c", "b"]);
  });

  it("pipeline queues and execs in order (rate-limit and notify shapes)", async () => {
    const fake = createRedisFake();
    expect(await fake.pipeline().incr("rl").expire("rl", 60).exec()).toEqual([1, 1]);
    expect(await fake.pipeline().lpush("nl", { t: 1 }).ltrim("nl", 0, 19).expire("nl", 60).expire("nr", 60).exec()).toEqual([
      1,
      "OK",
      1,
      0,
    ]);
    expect(fake.ttls.get("rl")).toBe(60);
  });

  it("sadd/smembers/scard and del/exists cover the ev + cleanup paths", async () => {
    const fake = createRedisFake();
    expect(await fake.sadd("s", "u1")).toBe(1);
    expect(await fake.sadd("s", "u1", "u2")).toBe(1);
    expect(await fake.smembers("s")).toEqual(expect.arrayContaining(["u1", "u2"]));
    expect(await fake.scard("s")).toBe(2);
    expect(await fake.exists("s", "nope")).toBe(1);
    expect(await fake.del("s", "nope")).toBe(1);
    expect(await fake.scard("s")).toBe(0);
  });

  it("expire NX sets a TTL only when the key has none (the rate-limit fixed window)", async () => {
    const fake = createRedisFake();
    await fake.incr("rl:x");
    // first NX expire sets the window
    expect(await fake.expire("rl:x", 60, "nx")).toBe(1);
    expect(fake.ttls.get("rl:x")).toBe(60);
    // a later NX expire must NOT extend it
    expect(await fake.expire("rl:x", 999, "nx")).toBe(0);
    expect(fake.ttls.get("rl:x")).toBe(60);
    // plain expire still refreshes (used by board TTL keep-alive)
    expect(await fake.expire("rl:x", 999)).toBe(1);
    expect(fake.ttls.get("rl:x")).toBe(999);
  });
});
