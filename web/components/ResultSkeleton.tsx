// Loading placeholder shaped like ResultCard so the simulate -> reveal transition doesn't collapse
// to a tiny text pulse and then slam to a full card (two big layout shifts at the game's emotional
// peak). Reserves the card's rough height with pulsing bars; the label is mode-aware.
import React from "react";

export default function ResultSkeleton({ label = "Running all 82 games…" }: { label?: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="animate-pulse">
        {/* hero */}
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 pt-6 pb-5">
          <div className="mx-auto h-3 w-32 rounded bg-zinc-800/70" />
          <div className="mx-auto mt-3 h-16 w-52 rounded-xl bg-zinc-800/70 sm:h-20" />
          <div className="mx-auto mt-3 h-4 w-40 rounded bg-zinc-800/60" />
          <div className="mt-4 flex justify-center gap-2">
            <div className="h-7 w-20 rounded-lg bg-zinc-800/60" />
            <div className="h-7 w-20 rounded-lg bg-zinc-800/60" />
            <div className="h-7 w-20 rounded-lg bg-zinc-800/60" />
          </div>
        </div>
        {/* why-this-record: two factor columns */}
        <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 px-6 py-5">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-4 rounded bg-zinc-800/50" />)}
            </div>
          ))}
        </div>
        {/* starting five rows */}
        <div className="space-y-2 border-t border-zinc-800 px-6 py-5">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 rounded-lg bg-zinc-800/40" />)}
        </div>
      </div>
      <p className="border-t border-zinc-800 py-4 text-center text-sm font-medium text-zinc-400" role="status" aria-live="polite">{label}</p>
    </div>
  );
}
