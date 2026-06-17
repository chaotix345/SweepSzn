"use client";
import { useSessionContext } from "@/components/SessionProvider";
import { AUTH_ENABLED } from "@/lib/authClient";

// Non-Daily results (Classic / HoopIQ / Prime) have no leaderboard, so a signed-out player finishes a
// game with zero reason to make an account — the biggest retention leak for a launch audience arriving
// on those modes via share links. This is the minimal save/keep nudge. Self-disables when auth is off
// or the player is already signed in (Daily already prompts via the Leaderboard, so this isn't shown
// there).
export default function SignInSaveNudge() {
  const { user, promptSignIn } = useSessionContext();
  if (!AUTH_ENABLED || user) return null;
  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 text-xs text-zinc-400">
        This result is saved on this device only. Sign in to keep your streak and results across every device.
      </div>
      <button
        onClick={promptSignIn}
        className="w-full rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-900 transition hover:bg-zinc-100"
      >
        Sign in with Google
      </button>
    </div>
  );
}
