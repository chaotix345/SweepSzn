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
          <span className="text-sm text-zinc-500">Round {roundNum}/5</span>
        </div>
        {showRestart && (
          <button onClick={onRestart} className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500">↻ Restart</button>
        )}
      </header>
      {children}
    </div>
  );
}
