"use client";
import { useCallback, useState, useSyncExternalStore } from "react";

// First-run levers tip (R6): hydration-safe "seen" read. Server snapshot is "seen" (true) so the
// server renders nothing; the client reads the real flag and useSyncExternalStore reconciles without
// a hydration mismatch (same pattern ResultCard uses for the Web Share capability check).
const subscribeNoop = () => () => {};
const getTipSeen = () => { try { return !!localStorage.getItem("szn_levers_tip_seen"); } catch { return true; } };
const getTipSeenServer = () => true;

// First-run scoring primer (R6): names the real levers honestly so new players don't learn the
// mechanics only by losing. Dismissible, localStorage-gated, never blocks play (no modal).
export function LeversTip() {
  const tipSeen = useSyncExternalStore(subscribeNoop, getTipSeen, getTipSeenServer);
  const [tipDismissed, setTipDismissed] = useState(false);
  const dismiss = useCallback(() => {
    try { localStorage.setItem("szn_levers_tip_seen", "1"); } catch { /* no storage */ }
    setTipDismissed(true);
  }, []);
  if (tipSeen || tipDismissed) return null;
  return (
    <details open className="mx-auto mt-3 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-left">
      <summary className="cursor-pointer text-xs font-bold text-zinc-300">New here? How your five is scored</summary>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        The engine simulates 82 games and weighs several things at once: <strong className="text-zinc-300">star offense</strong> and{" "}
        <strong className="text-zinc-300">defense</strong>, floor <strong className="text-zinc-300">spacing</strong>, and{" "}
        <strong className="text-zinc-300">usage overload</strong> — one ball can&apos;t feed five high-usage scorers. Two more quietly
        decide seasons: <strong className="text-zinc-300">interior size</strong> (rim protection) and{" "}
        <strong className="text-zinc-300">perimeter defense</strong> — a five with neither bleeds real wins. Pre-1985 box stats are
        discounted, too. The bottom line is fit, not PPG.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button onClick={dismiss} className="rounded-md bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700">Got it</button>
        <a href="/how-it-works" className="text-[11px] font-semibold text-orange-400 hover:underline">Full breakdown →</a>
      </div>
    </details>
  );
}
