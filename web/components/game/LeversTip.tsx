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
// F03: collapsed to a one-line summary by default so the reels and the first candidates stay above
// the fold; the breakdown link opens a new tab so it can't wipe a draft in progress.
export function LeversTip() {
  const tipSeen = useSyncExternalStore(subscribeNoop, getTipSeen, getTipSeenServer);
  const [tipDismissed, setTipDismissed] = useState(false);
  const dismiss = useCallback(() => {
    try { localStorage.setItem("szn_levers_tip_seen", "1"); } catch { /* no storage */ }
    setTipDismissed(true);
  }, []);
  if (tipSeen || tipDismissed) return null;
  return (
    <div className="mx-auto mt-3 flex w-full max-w-md items-start rounded-xl border border-zinc-800 bg-zinc-900/60 text-left">
      <details className="min-w-0 flex-1 py-3 pl-3">
        <summary className="cursor-pointer text-xs font-bold text-zinc-300">New here? How your five is scored</summary>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
          The engine simulates 82 games and weighs several things at once: <strong className="text-zinc-300">star offense</strong> and{" "}
          <strong className="text-zinc-300">defense</strong>, floor <strong className="text-zinc-300">spacing</strong>, and{" "}
          <strong className="text-zinc-300">usage overload</strong> — one ball can&apos;t feed five high-usage scorers. Two more quietly
          decide seasons: <strong className="text-zinc-300">interior size</strong> (rim protection) and{" "}
          <strong className="text-zinc-300">perimeter defense</strong> — a five with neither bleeds real wins. Pre-1985 box stats are
          discounted, too. The bottom line is fit, not PPG.
        </p>
        <div className="mt-1 flex items-center gap-3">
          <button onClick={dismiss} className="min-h-11 rounded-md px-1 text-[11px] font-semibold text-zinc-200 hover:text-white">Got it</button>
          <a href="/how-it-works" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-[11px] font-semibold text-orange-400 hover:underline">
            Full breakdown ↗<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </details>
      <button onClick={dismiss} aria-label="Dismiss scoring tip" className="grid min-h-11 min-w-11 shrink-0 place-items-center text-sm text-zinc-400 hover:text-zinc-200">✕</button>
    </div>
  );
}
