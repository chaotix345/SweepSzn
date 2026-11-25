// Tracked env-gated ops tool: move stored scores onto the v4 engine (DESIGN.md §14, spec §9.3).
// Run once, right after the v4 deploy is live:
//   DRY_RUN=1 npx tsx scripts/rescore_v4.ts     # counts only, writes nothing
//   npx tsx scripts/rescore_v4.ts               # rescore profiles, challenges, today's Daily; archive weekly/all-time
// Requires UPSTASH_REDIS_REST_URL/TOKEN. Skips cleanly when absent. Idempotent (lib/rescore.ts).
import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { evaluateLineup, DEFAULT_COEFFICIENTS } from "../lib/engine";
import { rescoreProfileResults, rescoreChallenge, rescoreBoard, archiveBoard, type RescoreRedis } from "../lib/rescore";
import { dayUTC } from "../lib/day";
import { isoWeek } from "../lib/isoweek";
import type { Player, Coefficients } from "../lib/types";

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.log("skipped: set UPSTASH_REDIS_REST_URL/TOKEN");
  process.exit(0);
}
const DRY = process.env.DRY_RUN === "1";
const CHALLENGE_TTL = 60 * 60 * 24 * 31;

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const { _meta, ...coeffRaw } = JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8"));
if (_meta?.engine_version !== 4) { console.log(`refusing: coefficients.json engine_version=${_meta?.engine_version}, expected 4`); process.exit(1); }
const c: Coefficients = { ...DEFAULT_COEFFICIENTS, ...coeffRaw };
const byId = new Map(players.map((p) => [p.id, p]));
const evaluate = (ids: string[]) => {
  const five = ids.map((id) => byId.get(id));
  return five.every(Boolean) ? evaluateLineup(five as Player[], c) : null;
};

const real = new Redis({ url, token });
const noop = async () => null;
const r: RescoreRedis = DRY
  ? { ...(real as unknown as RescoreRedis), get: real.get.bind(real), hgetall: real.hgetall.bind(real),
      zrange: real.zrange.bind(real) as RescoreRedis["zrange"], lrange: real.lrange.bind(real) as RescoreRedis["lrange"],
      set: noop, hset: noop, zadd: noop, lpush: noop, del: noop }
  : (real as unknown as RescoreRedis);

async function scanKeys(match: string): Promise<string[]> {
  const out: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await real.scan(cursor, { match, count: 500 });
    out.push(...keys);
    cursor = String(next);
  } while (cursor !== "0");
  return out;
}

(async () => {
  console.log(`rescore v4 ${DRY ? "(DRY RUN)" : ""}`);
  const profiles = (await scanKeys("results:*")).filter((k) => !k.startsWith("results:lock:"));
  let profChanged = 0;
  for (const k of profiles) profChanged += await rescoreProfileResults(r, k.slice("results:".length), evaluate);
  console.log(`profiles: ${profiles.length} scanned, ${profChanged} results rescored`);

  const chals = (await scanKeys("chal:*:info")).map((k) => k.slice("chal:".length, -":info".length));
  let chalChanged = 0;
  for (const id of chals) if (await rescoreChallenge(r, id, evaluate, CHALLENGE_TTL)) chalChanged++;
  console.log(`challenges: ${chals.length} scanned, ${chalChanged} rescored`);

  const today = dayUTC();
  const dailyChanged = await rescoreBoard(r, `lb:${today}`, `lb:${today}:meta`, evaluate);
  console.log(`daily ${today}: ${dailyChanged} rows rescored`);

  const w = isoWeek(new Date().toISOString().slice(0, 10));
  const a1 = await archiveBoard(r, "lb:alltime", "lb:alltime:meta", 3);
  const a2 = await archiveBoard(r, `lb:week:${w}`, `lb:week:${w}:meta`, 3);
  console.log(`archived: all-time=${a1} week ${w}=${a2}`);
})();
