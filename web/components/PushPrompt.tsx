"use client";
import { usePush } from "@/lib/usePush";

// Two opt-in contexts share one component:
//  - "challenge": rendered in the creator dashboard right after a challenge is created.
//  - "streak":    rendered on the Daily result after a submit — the streak-saver cron's opt-in surface
//                 (Daily is ~95% of plays, where re-engagement actually lives).
// Permission is requested only on click, never on load. Fully self-disabling: renders nothing when
// push is unconfigured or unsupported, and nothing (no nag) once denied.
type PushContext = "challenge" | "streak";
const COPY: Record<PushContext, { cta: string; granted: string; ios: string }> = {
  challenge: {
    cta: "🔔 Notify me when a friend responds",
    granted: "🔔 Alerts on — we'll ping you when a friend takes this.",
    ios: "On iPhone, add SweepSzn to your Home Screen (Share → Add to Home Screen) to get an alert when a friend responds.",
  },
  streak: {
    cta: "🔔 Remind me before my streak breaks",
    granted: "🔔 Streak reminders on — we'll nudge you before the daily resets.",
    ios: "On iPhone, add SweepSzn to your Home Screen (Share → Add to Home Screen) to get a daily streak reminder.",
  },
};

export default function PushPrompt({ context = "challenge" }: { context?: PushContext }) {
  const { state, subscribe } = usePush();
  const copy = COPY[context];

  if (state === "unsupported" || state === "denied") return null;

  if (state === "ios-needs-install") {
    return (
      <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-center text-xs text-zinc-500">
        {copy.ios}
      </p>
    );
  }

  if (state === "granted") {
    return (
      <p className="mt-3 text-center text-xs font-semibold text-zinc-500">
        {copy.granted}
      </p>
    );
  }

  // default | busy
  return (
    <button
      onClick={subscribe}
      disabled={state === "busy"}
      className="mt-3 w-full rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-60"
    >
      {state === "busy" ? "Enabling…" : copy.cta}
    </button>
  );
}
