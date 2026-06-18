import "server-only";
import { createHash } from "crypto";
import webpush from "web-push";
import { redis, TTL } from "./redis";
import { logError } from "./log";
import { notificationText, type PushSub } from "./notify";
import type { Notif } from "./types";

// Web-push subscription store + sender. Self-disabling: push is OFF unless all three VAPID env vars
// are present (mirrors isRedisEnabled/isAuthEnabled), so the build/deploy never breaks without them.
// Key: push:<uid> = HASH { sha256(endpoint) -> PushSub } (multi-device), 31-day TTL. Every operation
// is error-swallowing — push must NEVER break the calling route.

const keyPush = (uid: string) => `push:${uid}`;
const field = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

// Cap distinct devices per uid. Bounds the blast radius of a cross-uid subscription injection (an anon
// uid is a bearer token; a signed-in uid is un-fakeable) AND the parallel push fan-out cost per event.
export const PUSH_SUB_CAP = 10;

// The public key may be exposed to the client (NEXT_PUBLIC_…) or kept server-side; accept either.
export function pushPublicKey(): string | undefined {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined;
}

function vapidSubject(): string | undefined {
  const s = process.env.VAPID_SUBJECT;
  if (!s) return undefined;
  return /^(mailto:|https:\/\/)/.test(s) ? s : `mailto:${s}`;
}

export function isPushEnabled(): boolean {
  return !!(pushPublicKey() && process.env.VAPID_PRIVATE_KEY && vapidSubject());
}

let vapidConfigured = false;
function configureVapid(): boolean {
  if (!isPushEnabled()) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(vapidSubject()!, pushPublicKey()!, process.env.VAPID_PRIVATE_KEY!);
    vapidConfigured = true;
  }
  return true;
}

// Persist a (validated) subscription under a uid. Best-effort; returns whether it was stored. Enforces
// PUSH_SUB_CAP, but always allows re-storing an endpoint that's already present (key rotation / refresh).
export async function saveSubscription(uid: string, sub: PushSub): Promise<boolean> {
  if (!redis) return false;
  try {
    const f = field(sub.endpoint);
    const already = await redis.hexists(keyPush(uid), f);
    if (!already && (await redis.hlen(keyPush(uid))) >= PUSH_SUB_CAP) return false;
    await redis.pipeline().hset(keyPush(uid), { [f]: sub }).expire(keyPush(uid), TTL).exec();
    return true;
  } catch { return false; }
}

// Remove one subscription (client toggle-off / browser revoke). Best-effort.
export async function removeSubscription(uid: string, endpoint: string): Promise<void> {
  if (!redis) return;
  try { await redis.hdel(keyPush(uid), field(endpoint)); } catch { /* best-effort */ }
}

// Carry a device's anonymous push subscriptions onto its newly signed-in account so challenge
// notifications keep arriving (anon uid -> authed uid). Best-effort; respects PUSH_SUB_CAP and
// drops the old key once copied. Never throws.
export async function migratePushSubs(fromUid: string, toUid: string): Promise<void> {
  if (!redis || fromUid === toUid) return;
  try {
    const subs = (await redis.hgetall<Record<string, PushSub>>(keyPush(fromUid))) ?? {};
    const entries = Object.entries(subs);
    if (!entries.length) return;
    const have = await redis.hlen(keyPush(toUid));
    const room = Math.max(0, PUSH_SUB_CAP - have);
    if (room > 0) {
      const obj: Record<string, PushSub> = {};
      for (const [f, s] of entries.slice(0, room)) obj[f] = s;
      await redis.pipeline().hset(keyPush(toUid), obj).expire(keyPush(toUid), TTL).exec();
    }
    await redis.del(keyPush(fromUid));
  } catch { /* best-effort */ }
}

// Fan an arbitrary {title, body, url} payload out to all of a uid's devices (the sw.js push
// handler's exact shape). No-op when push or redis is unavailable; capped at PUSH_SUB_CAP; dead
// endpoints (404/410 Gone) are pruned. Never throws. Returns whether at least one device was
// targeted (so a cron can count real sends). Used by the challenge notification below and the
// streak-saver cron.
export async function sendRawPushToUid(uid: string, payload: { title: string; body: string; url: string }): Promise<boolean> {
  if (!redis || !configureVapid()) return false;
  try {
    const subs = (await redis.hgetall<Record<string, PushSub>>(keyPush(uid))) ?? {};
    const entries = Object.entries(subs).slice(0, PUSH_SUB_CAP);
    if (!entries.length) return false;
    const body = JSON.stringify(payload);
    await Promise.all(entries.map(async ([f, sub]) => {
      try {
        await webpush.sendNotification(sub, body);
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { try { await redis!.hdel(keyPush(uid), f); } catch { /* ignore */ } }
      }
    }));
    return true;
  } catch (err) {
    logError("push.send", err); // never the uid — it's a bearer token
    return false;
  }
}

// Fan a notification out to all of a uid's devices. Never throws.
export async function sendPushToUid(uid: string, n: Notif): Promise<void> {
  const { title, body } = notificationText(n);
  const url = n.type === "badge_unlock" ? "/dex" : `/play?own=${n.challengeId}`;
  await sendRawPushToUid(uid, { title, body, url });
}
