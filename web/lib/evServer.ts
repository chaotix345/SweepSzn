import type { Redis } from "@upstash/redis";
import { dayUTC } from "./day";

// Owned funnel-counter writer. Five stages; play/share also arrive via the /api/ev beacon.
// All writes are best-effort: this module must NEVER throw or block a user-facing route.
export type EvStage = "play" | "complete" | "share" | "signin" | "submit";

export const EV_TTL = 60 * 60 * 24 * 45; // ~45 days, enough for a 14-day window + retention look-back
export const EV_ACTIVE_CAP = 50_000;     // max distinct uids tracked per day (far above realistic DAU)

const UID_RE = /^[a-z0-9-]{8,64}$/i;
const MODES = new Set(["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint"]);

export interface BeaconBody { ev: "play" | "share"; uid?: string; mode?: string }

// Validate an untrusted beacon payload. Returns null for anything not a valid play/share beacon.
export function parseEvBody(body: unknown): BeaconBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.ev !== "play" && b.ev !== "share") return null;
  const out: BeaconBody = { ev: b.ev };
  if (typeof b.uid === "string" && UID_RE.test(b.uid)) out.uid = b.uid;
  if (b.ev === "play" && typeof b.mode === "string" && MODES.has(b.mode)) out.mode = b.mode;
  return out;
}

// Increment counters for one stage. `day` defaults to today (UTC). Best-effort, error-swallowing.
export async function bump(
  redis: Redis | null,
  stage: EvStage,
  opts: { uid?: string; mode?: string; day?: string } = {},
): Promise<void> {
  if (!redis) return;
  const day = opts.day ?? dayUTC();
  try {
    const counterKey = `ev:${stage}:${day}`;
    await redis.incr(counterKey);
    await redis.expire(counterKey, EV_TTL);
    await redis.hincrby("ev:totals", stage, 1); // persistent: never expired

    if (stage === "play" && opts.mode && MODES.has(opts.mode)) {
      const modeKey = `ev:mode:${day}`;
      await redis.hincrby(modeKey, opts.mode, 1);
      await redis.expire(modeKey, EV_TTL);
    }
    // play/share/signin/submit carry a uid → contribute to the day's distinct-active set.
    // Cap distinct-member growth: the beacon is unauthenticated, so without a bound a flood of
    // unique uids could exhaust shared Redis memory (the set lives EV_TTL and is materialised by
    // /admin). Beyond the cap, DAU/retention become approximate — acceptable for internal metrics.
    if (opts.uid && stage !== "complete") {
      const activeKey = `ev:active:${day}`;
      if ((await redis.scard(activeKey)) < EV_ACTIVE_CAP) {
        await redis.sadd(activeKey, opts.uid);
        await redis.expire(activeKey, EV_TTL);
      }
    }
  } catch {
    /* analytics must never break the calling route */
  }
}
