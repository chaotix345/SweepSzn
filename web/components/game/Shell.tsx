import React from "react";
import { MODE_LABEL, MODE_ACCENT, type Mode, type ModeAccent } from "@/components/game/types";

// Mode-accent tints for the in-game badge (literal class strings so Tailwind keeps them).
const BADGE: Record<ModeAccent, string> = {
  orange: "bg-orange-500/15 text-orange-300",
  violet: "bg-violet-500/15 text-violet-300",
  cyan: "bg-cyan-500/15 text-cyan-300",
  rose: "bg-rose-500/15 text-rose-300",
};

export function Shell({ children, roundNum, mode, onRestart, showRestart }: {
  children: React.ReactNode; roundNum: number; mode: Mode; onRestart: () => void; showRestart?: boolean;
}) {
  return (
    <div className="animate-rise-in mx-auto max-w-4xl px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${BADGE[MODE_ACCENT[mode]]}`}>{MODE_LABEL[mode]}</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1" role="img" aria-label={`Round ${Math.min(roundNum, 5)} of 5`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`h-1.5 w-5 rounded-full transition-colors ${
                  i < roundNum ? "bg-orange-500" : i === roundNum ? "animate-pulse bg-orange-400/60" : "bg-zinc-700"
                }`} />
              ))}
            </div>
            <span className="text-xs tabular-nums text-zinc-500">{Math.min(roundNum, 5)}/5</span>
          </div>
        </div>
        {showRestart && (
          <button onClick={onRestart} className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500">↻ Restart</button>
        )}
      </header>
      {children}
    </div>
  );
}
