import { useState, useRef, useCallback, useEffect } from "react";
import { setLocalVote, pickemSeedOk, setPickemSkip, type PickemVote } from "@/lib/pickem";
import { getUid } from "@/lib/streak";
import { track } from "@vercel/analytics";
import type { DraftStep, LineupResult, Player } from "@/lib/types";
import type { Mode } from "@/components/game/types";

export type { PickemVote };

type Spin = { team: string; decade: string };
type Result = { result: LineupResult; players: Player[]; trace: DraftStep[]; usedHints: boolean } | null;

export function usePickem(seed: string, current: Spin | null, mode: Mode | null, result: Result) {
  const [pickemVote, setPickemVote] = useState<PickemVote | null>(null);
  const [pickemDismissed, setPickemDismissed] = useState(false);        // voted or skipped THIS game
  const [pickemCrowd, setPickemCrowd] = useState<{ y: number; n: number } | null>(null);
  const [pickemSubject, setPickemSubject] = useState<string | null>(null); // "the 1970s Knicks" — captured at vote time for share copy
  const pickemRef = useRef<HTMLDivElement>(null);                          // vote overlay dialog

  // Pick'Em handlers. The vote is optimistic-local first (works even when Redis is dark) and
  // fire-and-forget to /api/pickem; X (or Escape) skips AND remembers the preference (spec).
  const votePickem = useCallback((v: PickemVote) => {
    setPickemVote(v); setPickemDismissed(true); setLocalVote(seed, v);
    setPickemSubject(current ? `the ${current.decade} ${current.team}` : null);
    track("pickem_vote", { vote: v });
    fetch("/api/pickem", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ seed, vote: v, uid: getUid() }),
    }).catch(() => { /* self-disabled or offline — the local vote still settles on the card */ });
  }, [seed, current]);

  const skipPickem = useCallback(() => { setPickemDismissed(true); setPickemSkip(); track("pickem_skip"); }, []);

  const reset = useCallback(() => {
    setPickemVote(null); setPickemDismissed(false); setPickemCrowd(null); setPickemSubject(null);
  }, []);

  // Once the record is in, pull the crowd split (and your stored vote — e.g. a Daily replay
  // from another device) for the crowd-vs-you strip. Best-effort: a 503 (Redis absent) or a
  // network error just leaves the strip off / local-vote-only. Synthetic cold-restore seeds
  // ("classic-restored" / "hoopiq-restored") pass pickemSeedOk but never carry votes — skip
  // them so every cold restore doesn't burn a Redis read. (Real free-play seeds end in digits,
  // so the suffix check can't collide.)
  useEffect(() => {
    if (!result || mode === "challenge" || !pickemSeedOk(seed) || seed.endsWith("-restored")) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/pickem?seed=${encodeURIComponent(seed)}&uid=${encodeURIComponent(getUid())}`);
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (cancelled) return;
        setPickemCrowd({ y: Number(d?.y) || 0, n: Number(d?.n) || 0 });
        const sv: PickemVote | null = d?.vote === "y" || d?.vote === "n" ? d.vote : null;
        if (sv) setPickemVote((p) => p ?? sv);
      } catch { /* crowd strip stays off */ }
    })();
    return () => { cancelled = true; };
  }, [result, mode, seed]);

  return { pickemVote, pickemDismissed, pickemCrowd, pickemSubject, pickemRef, votePickem, skipPickem, reset };
}
