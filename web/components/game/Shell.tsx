import React from "react";
import { MODE_LABEL, MODE_ACCENT, type Mode, type ModeAccent } from "@/components/game/types";

// Mode-accent tints for the in-game badge (literal class strings so Tailwind keeps them).
const BADGE: Record<ModeAccent, string> = {
  orange: "bg-orange-500/15 text-orange-300",
  violet: "bg-violet-500/15 text-violet-300",
  cyan: "bg-cyan-500/15 text-cyan-300",
  rose: "bg-rose-500/15 text-rose-300",
};

export function Shell({ children, roundNum, mode, onRestart, showRestart, onModeSelect, label, complete }: {
  children: React.ReactNode; roundNum: number; mode: Mode; onRestart: () => void; showRestart?: boolean;
  // Quiet escape hatch back to the picker: a deep-linked first-timer (/play?mode=daily) skips
  // ModeSelect, so this keeps mode discovery + the returning-user history one tap away. Zinc text,
  // not orange (DESIGN.md: orange is the play CTA only).
  onModeSelect?: () => void;
  label?: string; // badge override (W3 archive: "Archive · Nov 19")
  complete?: boolean; // all five picks are in (simulating / result): every round pill solid, none pulsing
}) {
  return (
    <div className="animate-rise-in mx-auto max-w-4xl px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:max-w-5xl lg:pb-6">
      {/* F10: one non-wrapping row on a 375px phone, 44px tap targets on the two buttons */}
      <header className="mb-5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {onModeSelect && (
            <button onClick={onModeSelect} className="-ml-1 inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-1 text-xs text-zinc-400 transition hover:text-zinc-200">← Modes</button>
          )}
          <span className={`min-w-0 truncate whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${BADGE[MODE_ACCENT[mode]]}`}>{label ?? MODE_LABEL[mode]}</span>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1" role="img" aria-label={complete ? "All five rounds drafted" : `Round ${Math.min(roundNum, 5)} of 5`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`h-1.5 w-3 rounded-full transition-colors sm:w-5 ${
                  complete || i < roundNum ? "bg-orange-500" : i === roundNum ? "animate-pulse bg-orange-400/60" : "bg-zinc-700"
                }`} />
              ))}
            </div>
            <span className="text-xs tabular-nums text-zinc-400">{Math.min(roundNum, 5)}/5</span>
          </div>
        </div>
        {showRestart && (
          <button onClick={onRestart} className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg border border-zinc-700 px-3 text-xs text-zinc-400 hover:border-zinc-500">↻ Restart</button>
        )}
      </header>
      {children}
    </div>
  );
}
