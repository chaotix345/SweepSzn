import React from "react";
import { MODE_LABEL, type Mode } from "@/components/game/types";

export function Shell({ children, roundNum, mode, onRestart, showRestart }: {
  children: React.ReactNode; roundNum: number; mode: Mode; onRestart: () => void; showRestart?: boolean;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold capitalize text-zinc-300">{MODE_LABEL[mode]}</span>
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
