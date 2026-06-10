// Tracked env-gated harness. Integration-tests the EXACT KEEP_BEST_LUA against real
// Upstash using THROWAWAY keys (lb:test:<random>), then deletes them. Skips cleanly when Upstash
// creds are absent so it is safe to commit and run in any environment.
// Needs Upstash REST creds in env:
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (or KV_REST_API_URL / KV_REST_API_TOKEN)
// Run: <creds in env> npx tsx scripts/lua_e2e.ts
import { Redis } from "@upstash/redis";
import { KEEP_BEST_LUA, encScore } from "../lib/score";

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) { console.log("skipped: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV equivalents) not set"); process.exit(0); }
const redis = new Redis({ url, token });

const tag = `test:${Math.random().toString(36).slice(2, 10)}`;
const dz = `lb:${tag}:daily`, wz = `lb:${tag}:week`, az = `lb:${tag}:alltime`;
const run = (uid: string, wins: number, net: number) =>
  redis.eval(KEEP_BEST_LUA, [dz, wz, az], [uid, encScore(wins, net), wins, 3600, 3600]) as Promise<[number, number, number, number]>;

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

(async () => {
  try {
    // first submit -> credit all wins
    let r = await run("u1", 70, 4);
    assert(r[0] === 1 && r[1] === 70 && r[2] === 70 && r[3] === 70, "first submit: changed, delta=70, weekly=70, alltime=70");

    // improvement -> credit only the delta
    r = await run("u1", 75, 6);
    assert(r[0] === 1 && r[1] === 5 && r[2] === 75 && r[3] === 75, "improve 70->75: delta=5, totals=75");

    // worse / equal -> no-op
    r = await run("u1", 72, 9);
    assert(r[0] === 0 && r[1] === 0, "worse score: no-op");
    r = await run("u1", 75, 6);
    assert(r[0] === 0, "re-submit equal: no-op");
    assert(Number(await redis.zscore(az, "u1")) === 75, "alltime still 75 after no-ops (idempotent)");

    // net-only improvement -> daily changes, 0 win delta
    r = await run("u1", 75, 20);
    assert(r[0] === 1 && r[1] === 0 && r[3] === 75, "net-only improve: changed, delta=0, alltime unchanged");

    // CONCURRENCY: 8 parallel identical first-submits for a fresh uid must credit the delta ONCE
    await Promise.all(Array.from({ length: 8 }, () => run("u2", 60, 5)));
    const u2alltime = Number(await redis.zscore(az, "u2"));
    assert(u2alltime === 60, `concurrent identical submits credit once (alltime u2 = ${u2alltime}, want 60)`);

    // a second uid accumulates independently; ranking by wins
    await run("u3", 82, 10);
    const top = await redis.zrange<string[]>(az, 0, -1, { rev: true });
    assert(top[0] === "u3" && top.includes("u1") && top.includes("u2"), "all-time ranks by wins (u3=82 first)");

    console.log(fail ? `\n${fail} LUA E2E ASSERTION(S) FAILED` : "\nALL LUA E2E CHECKS PASSED");
  } finally {
    await redis.del(dz, wz, az); // cleanup throwaway keys
    console.log("cleaned up throwaway keys", tag);
  }
  process.exit(fail ? 1 : 0);
})();
