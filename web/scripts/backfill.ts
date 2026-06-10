// Tracked env-gated recovery tool. Backfills a pre-feature daily-best into weekly + all-time,
// matching submitScoreAuthed's writes. Idempotent: skips if an entry already exists.
// Usage: BF_UID=<uid> BF_NAME=<name> BF_WINS=<wins> BF_WEEK=<2026-W24> npx tsx scripts/backfill.ts
// Requires: UPSTASH_REDIS_REST_URL/TOKEN + all BF_* vars. Skips cleanly when any are absent.
import { Redis } from "@upstash/redis";

const { BF_UID: UID, BF_NAME: NAME, BF_WEEK: WEEK } = process.env;
const WINS = Number(process.env.BF_WINS);
if (!process.env.UPSTASH_REDIS_REST_URL || !UID || !NAME || !WEEK || !Number.isInteger(WINS)) {
  console.log("skipped: set UPSTASH_REDIS_REST_URL/TOKEN, BF_UID, BF_NAME, BF_WINS, BF_WEEK");
  process.exit(0);
}
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });

const TTL_WEEK = 60 * 60 * 24 * 35;
const wz = `lb:week:${WEEK}`, wh = `lb:week:${WEEK}:meta`, az = "lb:alltime", ah = "lb:alltime:meta";

(async () => {
  console.log("before:", { week: await redis.zscore(wz, UID), alltime: await redis.zscore(az, UID) });
  if ((await redis.zscore(wz, UID)) == null) {
    await redis.zincrby(wz, WINS, UID);
    await redis.hset(wh, { [UID]: { uid: UID, name: NAME, wins: WINS } });
    await redis.expire(wz, TTL_WEEK); await redis.expire(wh, TTL_WEEK);
    console.log(`credited week +${WINS}`);
  } else console.log("week already has an entry — skipped (idempotent)");
  if ((await redis.zscore(az, UID)) == null) {
    await redis.zincrby(az, WINS, UID);
    await redis.hset(ah, { [UID]: { uid: UID, name: NAME, wins: WINS } });
    console.log(`credited alltime +${WINS}`);
  } else console.log("alltime already has an entry — skipped (idempotent)");
  console.log("after:", { week: await redis.zscore(wz, UID), alltime: await redis.zscore(az, UID), weekCard: await redis.zcard(wz), allCard: await redis.zcard(az) });
})();
