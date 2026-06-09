import "server-only";
import { redis, isRedisEnabled, TTL } from "./redis";
import { NOTIF_CAP, unreadCount } from "./notify";
import type { Notif, NotifView } from "./types";

// Per-uid notification inbox. Keys: notif:<uid> (LIST, newest-first, capped) + notif:<uid>:read
// (string watermark = ts of the newest item the user has marked read). Self-disabling via the shared
// redis module. Every write/read is error-swallowing: notifications must NEVER break a user route.

const keyList = (uid: string) => `notif:${uid}`;
const keyRead = (uid: string) => `notif:${uid}:read`;
const keyDedup = (uid: string, n: Notif) => `notif:dedup:${uid}:${n.challengeId}:${n.opponent}:${n.outcome}`;

const NOTIF_DEDUP_TTL = 60 * 60; // collapse repeat same-outcome pings from one responder for 1h

export function isNotifyEnabled(): boolean { return isRedisEnabled(); }

// Enqueue a notification to a uid. Dedups a burst of identical-outcome pings from the same responder on
// the same challenge (an improving friend can submit many times) into one. The LPUSH/LTRIM/EXPIRE +
// watermark-TTL refresh run in ONE pipeline so the list can never be left without its 31-day TTL (the
// orphan-key failure mode rateLimit guards against). Best-effort; never throws into the caller.
export async function enqueueNotif(uid: string, n: Notif): Promise<void> {
  if (!redis) return;
  try {
    const fresh = await redis.set(keyDedup(uid, n), 1, { nx: true, ex: NOTIF_DEDUP_TTL });
    if (fresh !== "OK") return; // an identical-outcome ping for this challenge+responder is already pending
    await redis.pipeline()
      .lpush(keyList(uid), n)                  // @upstash/redis JSON-encodes objects (same as hset)
      .ltrim(keyList(uid), 0, NOTIF_CAP - 1)
      .expire(keyList(uid), TTL)
      .expire(keyRead(uid), TTL)               // keep the watermark alive as long as the list (no-op if unset)
      .exec();
  } catch { /* never break the caller */ }
}

// Read a uid's inbox + unread count (items newer than the read watermark). Best-effort; empty on error.
export async function getNotifs(uid: string): Promise<NotifView> {
  if (!redis) return { items: [], unread: 0 };
  try {
    const items = (await redis.lrange<Notif>(keyList(uid), 0, NOTIF_CAP - 1)) ?? [];
    const wm = Number((await redis.get<number>(keyRead(uid))) ?? 0);
    return { items, unread: unreadCount(items, wm) };
  } catch { return { items: [], unread: 0 }; }
}

// Mark everything read: set the watermark to the newest item's ts. Returns the (now-zero) unread.
export async function markNotifsRead(uid: string): Promise<number> {
  if (!redis) return 0;
  try {
    const newest = (await redis.lrange<Notif>(keyList(uid), 0, 0)) ?? [];
    const ts = newest[0]?.ts ?? 0;
    if (ts) await redis.set(keyRead(uid), ts, { ex: TTL });
  } catch { /* best-effort */ }
  return 0;
}
