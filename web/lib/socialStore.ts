import "server-only";
import type { Redis } from "@upstash/redis";
import { logError } from "./log";

// Silent crowd-signal + rarity logging. Both writers are best-effort and MUST NEVER throw or block a
// user-facing route. The data is written now (pre-launch) so it has volume to be meaningful when the
// crowd reveal + rarity badge UI ship later. Everything here is post-lock / post-commit counting —
// it never produces a pre-commit signal (DESIGN.md §12 trust model).

const MODES = new Set(["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint", "surgeon"]);
const SLOTS = new Set(["PG", "SG", "SF", "PF", "C"]);
const SPINKEY_RE = /^[A-Za-z]{2,4}\|[A-Za-z0-9]{2,6}$/; // TEAM|DECADE, decade incl. "PRIME"
const PERSON_RE = /^[a-z0-9_]{1,64}$/;

export interface SlotPick { mode: string; spinKey: string; slot: string; personId: string }

// Validate an untrusted slot-pick beacon. Returns null for anything malformed.
export function parseSlotPick(body: unknown): SlotPick | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.mode !== "string" || !MODES.has(b.mode)) return null;
  if (typeof b.spinKey !== "string" || !SPINKEY_RE.test(b.spinKey)) return null;
  if (typeof b.slot !== "string" || !SLOTS.has(b.slot)) return null;
  if (typeof b.personId !== "string" || !PERSON_RE.test(b.personId)) return null;
  return { mode: b.mode, spinKey: b.spinKey, slot: b.slot, personId: b.personId };
}

export const slotPickHashKey = (mode: string, spinKey: string, slot: string): string =>
  `slot_picks:${mode}:${spinKey}:${slot}`;

// A core's identity is its five people, slot-order-independent — sort the person_ids so the same five
// always map to the same key (rarity counts cores, not lineups).
export const coreKeyOf = (personIds: string[]): string => [...personIds].sort().join(",");

// Count one slot pick: per-player + a per-slot __total__, in a hash keyed by (mode, spin, slot).
export async function logSlotPick(redis: Redis | null, p: SlotPick): Promise<void> {
  if (!redis) return;
  try {
    const k = slotPickHashKey(p.mode, p.spinKey, p.slot);
    await redis.pipeline().hincrby(k, p.personId, 1).hincrby(k, "__total__", 1).exec();
  } catch (err) {
    logError("social.slotPick", err, { mode: p.mode });
  }
}

// Count one completed five-man core (for rarity) + a global denominator.
export async function logCore(redis: Redis | null, personIds: string[]): Promise<void> {
  if (!redis || personIds.length !== 5) return;
  try {
    await redis.pipeline().hincrby("core_picks", coreKeyOf(personIds), 1).incr("core_picks:total").exec();
  } catch (err) {
    logError("social.core", err);
  }
}
