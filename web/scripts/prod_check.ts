// Tracked env-gated dev check. Read-only: confirms the creds in env point at the expected DB and
// inspects a user's leaderboard standing across daily/weekly/all-time.
// Usage: PC_DAY=lb:2026-6-8 PC_WEEK=2026-W24 PC_UID=<uid> npx tsx scripts/prod_check.ts
// Requires: UPSTASH_REDIS_REST_URL/TOKEN + all PC_* vars. Skips cleanly when any are absent.
import { Redis } from "@upstash/redis";

const { PC_DAY: DAY, PC_WEEK, PC_UID: UID } = process.env;
if (!process.env.UPSTASH_REDIS_REST_URL || !DAY || !PC_WEEK || !UID) {
  console.log("skipped: set UPSTASH_REDIS_REST_URL/TOKEN, PC_DAY, PC_WEEK, PC_UID");
  process.exit(0);
}
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
const WEEK = `lb:week:${PC_WEEK}`;

(async () => {
  console.log("=== user's standing ===");
  console.log("  daily ", DAY, ":", await redis.zscore(DAY, UID));
  console.log("  week  ", WEEK, ":", await redis.zscore(WEEK, UID));
  console.log("  all-time:", await redis.zscore("lb:alltime", UID));
  console.log("=== board totals ===");
  console.log("  daily:", await redis.zcard(DAY), " week:", await redis.zcard(WEEK), " alltime:", await redis.zcard("lb:alltime"));
})();
