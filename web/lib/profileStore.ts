import "server-only";
import { redis } from "./redis";
import { dayUTC } from "./day";

// Per-account persistence for signed-in players: the cross-device home for streak, result history,
// and the editable display handle. Anonymous players keep using localStorage (lib/streak.ts,
// lib/resultHistory.ts); these keys mirror that data on the server keyed by the un-fakeable authed
// uid so it follows the account onto any device. Self-disabling via the shared redis module.
//
//   profile:{uid}   HASH  { name, picture, createdAt }            — no TTL
//   streak:{uid}    ZSET  member = dayUTC()/utcKey day-key        — no TTL; score = completion ms
//   results:{uid}   LIST  JSON ProfileResult, newest-first, capped — no TTL

const keyProfile = (uid: string) => `profile:${uid}`;
const keyStreak = (uid: string) => `streak:${uid}`;
const keyResults = (uid: string) => `results:${uid}`;

export const RESULTS_CAP = 200;
const DAY_MS = 86_400_000;

// Mirrors lib/resultHistory.ts ResultEntry (mode kept as a plain string here — the route validates
// it against the allowed set at the trust boundary).
export interface ProfileResult {
  encoded: string;
  mode: string;
  wins: number;
  losses: number;
  grade: string;
  ts: number;
  challengeId?: string;
}

export interface StoredProfile { name: string; picture: string; createdAt: number }

// Re-emit a "YYYY-M-D" / "YYYY-MM-DD" string through the canonical dayUTC formula (non-padded), so the
// daily-submit write path and the localStorage backfill land on identical members. null if unparseable.
function parseDay(s: unknown): { key: string; ms: number } | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  // Reject absurd far-past/far-future years from untrusted sync input (bounds the no-TTL streak ZSET).
  // Wide enough to never reject a legitimate near-future date.
  if (y < 2000 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  return { key: dayUTC(new Date(ms)), ms };
}

export const canonicalDay = (s: unknown): string | null => parseDay(s)?.key ?? null;

// Consecutive UTC days ending today (or yesterday, so a streak survives until day's end). Pure mirror
// of lib/streak.ts:getStreak, computed over the server member set with the same dayUTC formatter.
export function streakFromDates(dates: string[], now: number): number {
  const set = new Set(dates);
  if (!set.size) return 0;
  const today = dayUTC(new Date(now));
  const yest = dayUTC(new Date(now - DAY_MS));
  const anchor = set.has(today) ? now : set.has(yest) ? now - DAY_MS : 0;
  if (!anchor) return 0;
  let streak = 0;
  for (let t = anchor; set.has(dayUTC(new Date(t))); t -= DAY_MS) streak++;
  return streak;
}

// --- streak ---

// Trusted write from a verified daily submit. score = completion ms; member identity is the day-key.
export async function recordStreakDate(uid: string, date: string, ts: number): Promise<void> {
  if (!redis) return;
  const day = canonicalDay(date);
  if (!day) return;
  await redis.zadd(keyStreak(uid), { score: ts, member: day });
}

// Lightly-trusted union backfill from a device's local history. Dedupes within the batch and stamps
// each backfilled day with its own UTC-midnight ms (so an old date never carries a "future" score).
export async function syncStreakDates(uid: string, dates: string[]): Promise<void> {
  if (!redis || !dates.length) return;
  const seen = new Set<string>();
  const entries: { score: number; member: string }[] = [];
  for (const raw of dates) {
    const p = parseDay(raw);
    if (!p || seen.has(p.key)) continue;
    seen.add(p.key);
    entries.push({ score: p.ms, member: p.key });
  }
  // zadd's typing requires at least one explicit member after the key — pass the head, spread the rest.
  if (entries.length) await redis.zadd(keyStreak(uid), entries[0], ...entries.slice(1));
}

export async function getStreakCount(uid: string, now: number): Promise<number> {
  if (!redis) return 0;
  const members = (await redis.zrange<(string | number)[]>(keyStreak(uid), 0, -1)) ?? [];
  return streakFromDates(members.map(String), now);
}

// --- profile (display handle) ---

// On sign-in: keep name/picture current across devices (idempotent), but stamp createdAt only once.
// hsetnx is atomic — no check-then-set race when two devices sign in at the same moment.
export async function upsertProfileOnSignIn(uid: string, name: string, picture: string, now: number): Promise<void> {
  if (!redis) return;
  await redis.hset(keyProfile(uid), { name, picture });
  await redis.hsetnx(keyProfile(uid), "createdAt", now);
}

export async function setProfileName(uid: string, name: string): Promise<void> {
  if (!redis) return;
  await redis.hset(keyProfile(uid), { name });
}

export async function getProfileName(uid: string): Promise<string | null> {
  if (!redis) return null;
  const v = await redis.hget<unknown>(keyProfile(uid), "name");
  return typeof v === "string" ? v : v == null ? null : String(v);
}

// --- result history ---

export async function getResults(uid: string): Promise<ProfileResult[]> {
  if (!redis) return [];
  return (await redis.lrange<ProfileResult>(keyResults(uid), 0, RESULTS_CAP - 1)) ?? [];
}

// Union merge, deduped by mode:encoded (matching lib/resultHistory.ts), kept strictly newest-first by
// ts and capped. Returns how many fresh entries were actually added. Because a cross-device backfill can
// carry games OLDER than ones already stored, we re-sort the whole list by ts (not just prepend) so the
// cap can never evict a newer entry in favour of an older backfilled one.
export async function syncResults(uid: string, entries: ProfileResult[]): Promise<number> {
  if (!redis || !entries.length) return 0;
  const existing = (await redis.lrange<ProfileResult>(keyResults(uid), 0, -1)) ?? [];
  const seen = new Set(existing.map((e) => `${e.mode}:${e.encoded}`));
  const fresh: ProfileResult[] = [];
  for (const e of entries) {
    const k = `${e.mode}:${e.encoded}`;
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(e);
  }
  if (!fresh.length) return 0;
  const merged = [...existing, ...fresh].sort((a, b) => b.ts - a.ts).slice(0, RESULTS_CAP);
  // Rebuild the list newest-first: lpush leaves its LAST arg at the head, so push the reverse.
  await redis.del(keyResults(uid));
  await redis.lpush(keyResults(uid), ...[...merged].reverse());
  return fresh.length;
}
