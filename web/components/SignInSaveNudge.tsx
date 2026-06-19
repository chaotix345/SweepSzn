"use client";
import { useEffect, useRef } from "react";
import { useSessionContext } from "@/components/SessionProvider";
import { AUTH_ENABLED } from "@/lib/authClient";
import { ev } from "@/lib/ev";
import type { Mode } from "@/components/game/types";

// Non-Daily results (Classic / HoopIQ / Prime + FactorHunt / Blueprint / Surgeon / Challenge) have no
// claim-your-rank Leaderboard prompt, so a signed-out player finishes with zero reason to make an
// account — the biggest retention leak for a launch audience arriving on those modes via share links.
// This is the minimal save/keep nudge. Self-disables when auth is off or the player is already signed
// in (Daily already prompts via the Leaderboard, so this isn't shown there).
//
// Instrumented (mode-tagged) so its own funnel — shown → tap → signin — is measurable per mode on
// /admin + /api/funnel (claim_nudge_shown / claim_nudge_tap). The hook is called unconditionally
// (Rules of Hooks) and guarded by `show`, so the beacon fires only when the nudge actually renders.
export default function SignInSaveNudge({ mode }: { mode?: Mode }) {
  const { user, promptSignIn } = useSessionContext();
  const show = AUTH_ENABLED && !user;
  // Latch the impression beacon to at most once per mount: `show` can flip false→true if the player
  // signs out while this result screen is still mounted, which would otherwise double-count the
  // impression (inflating shown without a tap, making the tap rate pessimistic).
  const fired = useRef(false);
  useEffect(() => {
    if (show && !fired.current) { fired.current = true; ev("claim_nudge_shown", { mode }); }
  }, [show, mode]);
  if (!show) return null;
  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 text-xs text-zinc-400">
        Saved on this device only. Sign in to keep your results and streak across every device — one tap.
      </div>
      <button
        onClick={() => { ev("claim_nudge_tap", { mode }); promptSignIn(); }}
        className="w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-900 transition hover:bg-white"
      >
        Save with Google →
      </button>
    </div>
  );
}
