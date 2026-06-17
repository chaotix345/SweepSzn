import { NextResponse } from "next/server";
import { redis, isRedisEnabled } from "@/lib/redis";
import { isPushEnabled } from "@/lib/pushStore";
import { isAuthEnabled } from "@/lib/auth";

export const runtime = "nodejs";

// Public uptime/canary probe (no secrets — only which subsystems are CONFIGURED, plus a live Redis
// reachability ping, the most common post-deploy failure). no-store so a monitor always sees live
// status. Cheap by design: one PING when Redis is configured, otherwise pure env reads.
export async function GET() {
  let redisReachable = false;
  if (redis) {
    try {
      redisReachable = (await redis.ping()) === "PONG";
    } catch {
      redisReachable = false;
    }
  }
  return NextResponse.json(
    {
      ok: true,
      redis: { configured: isRedisEnabled(), reachable: redisReachable },
      push: isPushEnabled(),
      auth: isAuthEnabled(),
      cron: !!process.env.CRON_SECRET,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
