// Pure, client-safe notification helpers (no server-only imports) — unit-testable like score.ts.
// Used by the inbox UI (text + unread count), the submit route (build the event), and the push
// sender (text payload). The server stores/reads via notifyStore.ts; pushes via pushStore.ts.

import type { Notif, ChallengeNotif, BadgeNotif } from "./types";

export const NOTIF_CAP = 50; // max notifications retained per uid (LTRIM); newest-first

interface BuildInput {
  challengeId: string;
  opponent: string;
  outcome: ChallengeNotif["outcome"];
  tookLead: boolean;
  oppWins: number; oppLosses: number;
  yourWins: number; yourLosses: number;
  ts: number;
}

// Deterministic id (challenge:ts:opponent) — no RNG, so the unit test is stable and a duplicate
// submit at the same instant collapses to the same id rather than spamming the list. (The store also
// dedups identical-outcome pings per challenge+responder, so genuine collisions never accumulate.)
export function buildChallengeNotification(i: BuildInput): ChallengeNotif {
  return {
    id: `${i.challengeId}:${i.ts}:${i.opponent}`,
    type: "challenge_response",
    challengeId: i.challengeId,
    opponent: i.opponent,
    outcome: i.outcome,
    tookLead: i.tookLead,
    oppWins: i.oppWins, oppLosses: i.oppLosses,
    yourWins: i.yourWins, yourLosses: i.yourLosses,
    ts: i.ts,
  };
}

// A newly-unlocked Drafted Dex badge. Deterministic id ("badge:<key>") so a re-fire collapses to one.
export function buildBadgeNotification(badge: string, name: string, ts: number): BadgeNotif {
  return { id: `badge:${badge}`, type: "badge_unlock", badge, name, ts };
}

// Unread = notifications strictly newer than the read watermark (the ts of the newest item the user
// has marked read). Idempotent and drift-free; "mark all read" sets the watermark to the newest ts.
export function unreadCount(items: Pick<Notif, "ts">[], watermark: number): number {
  return items.reduce((n, it) => (it.ts > watermark ? n + 1 : n), 0);
}

// Shared copy for the in-app inbox AND the web-push payload, so both read identically.
export function notificationText(n: Notif): { title: string; body: string } {
  if (n.type === "badge_unlock") {
    return { title: `Badge unlocked: ${n.name}`, body: "A new milestone in your Drafted Dex — tap to see your collection." };
  }
  const them = n.opponent || "Someone";
  const bar = `${n.yourWins}-${n.yourLosses}`;
  const theirs = `${n.oppWins}-${n.oppLosses}`;
  if (n.outcome === "beaten") {
    return {
      title: n.tookLead ? `${them} took #1 on your challenge` : `${them} beat your ${bar}`,
      body: `${them} went ${theirs} — reclaim your spot.`,
    };
  }
  if (n.outcome === "tied") {
    return { title: `${them} tied your ${bar}`, body: `Dead heat at ${theirs} — break the tie.` };
  }
  return { title: `${them} took your challenge`, body: `You held them off — they went ${theirs}.` };
}

// A browser PushSubscription, trimmed to what web-push needs. Stored per uid.
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// The real browser push services. Restricting endpoints to these prevents the server from being
// coerced into an outbound HTTPS request to an attacker-controlled origin (SSRF) when it sends a push.
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "web.push.apple.com", "push.apple.com"]);
function allowedPushHost(endpoint: string): boolean {
  let host: string;
  try { host = new URL(endpoint).hostname.toLowerCase(); } catch { return false; }
  if (PUSH_HOSTS.has(host)) return true;
  // wildcard subdomains used by Windows (WNS) and Mozilla autopush
  return host.endsWith(".notify.windows.com") || host.endsWith(".push.services.mozilla.com");
}

// Shape-gate an untrusted subscription body at the trust boundary: require an https endpoint at a known
// push provider plus both encryption keys, all within sane length bounds. Returns the normalized sub or null.
export function validateSubscription(body: unknown): PushSub | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const endpoint = b.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1024) return null;
  if (!allowedPushHost(endpoint)) return null;
  const keys = b.keys;
  if (!keys || typeof keys !== "object") return null;
  const k = keys as Record<string, unknown>;
  const { p256dh, auth } = k;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!p256dh || !auth || p256dh.length > 256 || auth.length > 256) return null;
  return { endpoint, keys: { p256dh, auth } };
}
