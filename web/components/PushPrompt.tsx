"use client";
import { usePush } from "@/lib/usePush";

// Tasteful push opt-in, rendered inside the creator dashboard right AFTER a challenge is created — the
// exact moment a creator wants "tell me when a friend responds." Permission is requested only on click,
// never on load. Fully self-disabling: renders nothing when push is unconfigured or unsupported, and
// nothing (no nag) once denied.
export default function PushPrompt() {
  const { state, subscribe } = usePush();

  if (state === "unsupported" || state === "denied") return null;

  if (state === "ios-needs-install") {
    return (
      <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-center text-xs text-zinc-500">
        On iPhone, add SweepSzn to your Home Screen (Share → Add to Home Screen) to get an alert when a friend responds.
      </p>
    );
  }

  if (state === "granted") {
    return (
      <p className="mt-3 text-center text-xs font-semibold text-zinc-500">
        🔔 Alerts on — we&apos;ll ping you when a friend takes this.
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
      {state === "busy" ? "Enabling…" : "🔔 Notify me when a friend responds"}
    </button>
  );
}
