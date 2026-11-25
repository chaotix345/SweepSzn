import { newChallengeId, isFitLockableSeed } from "./challenge";
import type { DraftStep } from "./types";

// D6 "beat this": a Classic or Prime free-play result shares as a Challenge. Sharing submits the
// finished draft through the existing challenge flow (/api/challenge/submit, which replays the trace
// and fit-locks the seed), so the friend drafts the same spins and sees this five only after playing.

export type ChallengeDraft = { seed: string; asOf: string; trace: DraftStep[]; usedHints: boolean };

export function canShareAsChallenge(seed: string, trace: DraftStep[]): boolean {
  return isFitLockableSeed(seed) && trace.length === 5; // the same seeds the server fit-locks
}

// Creates the challenge and returns its id, or null when challenges are unavailable (no Redis → 503),
// the request fails, or it takes too long — the caller then falls back to the /r/ share.
export async function createShareChallenge(
  draft: ChallengeDraft,
  who: { uid: string; name: string },
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const id = newChallengeId();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
  try {
    const r = await (opts.fetchImpl ?? fetch)("/api/challenge/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, uid: who.uid, name: who.name, trace: draft.trace, seed: draft.seed, asOf: draft.asOf, usedHints: draft.usedHints }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const v = (await r.json()) as { role?: string; id?: string };
    return v?.role === "creator" && v.id === id ? id : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
