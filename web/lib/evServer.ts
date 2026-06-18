import type { Redis } from "@upstash/redis";
import { dayUTC } from "./day";
import { logError } from "./log";

// Owned funnel-counter writer. All writes are best-effort: this module must NEVER throw or block a
// user-facing route.
//
// CLIENT_STAGES arrive via the unauthenticated /api/ev beacon, so the client may inflate them — they
// are usage signals, not scores. The three server-authoritative stages (complete/signin/submit) are
// bumped only from inside trusted routes (evaluate / auth / *submit) and are rejected by parseEvBody
// so the client can never spoof a completion, sign-in, or competitive submit.
export const CLIENT_STAGES = [
  "visit", "first_play", "play", "share", "share_view",
  "explore_open", "whatif_open", "compare_open", "compare_friend",
] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];
export type EvStage = ClientStage | "complete" | "signin" | "submit";

export const EV_TTL = 60 * 60 * 24 * 45; // ~45 days, enough for a 14-day window + retention look-back
export const EV_ACTIVE_CAP = 50_000;     // max distinct uids tracked per day (far above realistic DAU)

// Stages whose uid counts toward the day's distinct-active set (DAU / D1 / D7). Deliberately an
// engaged-action allow-list: `visit` and `share_view` are non-engaging (a bouncer / a share recipient
// shouldn't inflate DAU), and `first_play` + the engagement events ride a uid that `play` already
// added — so only play/share/signin/submit qualify.
const ACTIVE_STAGES = new Set<EvStage>(["play", "share", "signin", "submit"]);

const CLIENT_STAGE_SET = new Set<string>(CLIENT_STAGES);
const UID_RE = /^[a-z0-9-]{8,64}$/i;
const MODES = new Set(["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint", "surgeon"]);

export interface BeaconBody { ev: ClientStage; uid?: string; mode?: string }

// Validate an untrusted beacon payload. Returns null for anything not a valid client-sendable beacon
// (server-authoritative stages are rejected here so the client can't spoof the trusted funnel).
export function parseEvBody(body: unknown): BeaconBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.ev !== "string" || !CLIENT_STAGE_SET.has(b.ev)) return null;
  const out: BeaconBody = { ev: b.ev as ClientStage };
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
    // one pipeline for the unconditional counters (each await here is an HTTP round trip)
    const counterKey = `ev:${stage}:${day}`;
    const p = redis.pipeline()
      .incr(counterKey)
      .expire(counterKey, EV_TTL)
      .hincrby("ev:totals", stage, 1); // persistent: never expired; `stage` is enum-typed + beacon-validated
    if (stage === "play" && opts.mode && MODES.has(opts.mode)) {
      const modeKey = `ev:mode:${day}`;
      p.hincrby(modeKey, opts.mode, 1).expire(modeKey, EV_TTL);
    }
    // submit-by-mode lives in its own hash so play→submit conversion is computable per mode
    // (plays land in ev:mode, submits in ev:submode — never conflated).
    if (stage === "submit" && opts.mode && MODES.has(opts.mode)) {
      const modeKey = `ev:submode:${day}`;
      p.hincrby(modeKey, opts.mode, 1).expire(modeKey, EV_TTL);
    }
    await p.exec();
    // play/share/signin/submit carry a uid → contribute to the day's distinct-active set.
    // Cap distinct-member growth: the beacon is unauthenticated, so without a bound a flood of
    // unique uids could exhaust shared Redis memory (the set lives EV_TTL and is materialised by
    // /admin). Beyond the cap, DAU/retention become approximate — acceptable for internal metrics.
    if (opts.uid && ACTIVE_STAGES.has(stage)) {
      const activeKey = `ev:active:${day}`;
      if ((await redis.scard(activeKey)) < EV_ACTIVE_CAP) {
        await redis.pipeline().sadd(activeKey, opts.uid).expire(activeKey, EV_TTL).exec();
      }
    }
  } catch (err) {
    logError("ev.bump", err, { stage }); // analytics must never break the calling route
  }
}
