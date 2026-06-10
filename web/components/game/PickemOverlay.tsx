import React from "react";
import { teamColors, eraLabel } from "@/lib/teams";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";
import type { PickemVote } from "@/components/game/usePickem";
import type { Mode } from "@/components/game/types";

type Spin = { team: string; decade: string };

/* Pick'Em pre-draft vote — focus-trapped dialog (same a11y mechanics as the sheet above).
   One tap votes; ✕ or Escape skips AND remembers the skip preference. Never blocks: the
   draft continues the moment either happens. */
export function PickemOverlay({ current, mode, dialogRef, onVote, onSkip }: {
  current: Spin; mode: Mode; dialogRef: React.RefObject<HTMLDivElement | null>;
  onVote: (v: PickemVote) => void; onSkip: () => void;
}) {
  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pick'Em crowd vote"
      onKeyDown={(e) => buildFocusTrapHandler(dialogRef, () => onSkip())(e)}
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-center shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-orange-500">🗳️ Pick&apos;Em</span>
          <button onClick={onSkip} aria-label="Skip Pick'Em — won't ask again" title="Skip — won't ask again"
            className="px-2 text-zinc-400 hover:text-zinc-200">✕</button>
        </div>
        {mode === "hoopiq" ? (
          <div className="mt-3 text-lg font-black">🧠 Mystery roster</div>
        ) : (
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="rounded-md px-2 py-1 text-sm font-black" style={{ background: teamColors(current.team).bg, color: teamColors(current.team).text }}>{current.team}</span>
            <span className="rounded-md bg-violet-500/20 px-2 py-1 text-sm font-bold text-violet-300">{eraLabel(current.decade)}</span>
          </div>
        )}
        <p className="mt-3 text-base font-semibold text-zinc-100">Will the best possible five from this roster win more than 60 games?</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={() => onVote("y")} className="rounded-xl bg-green-500 py-3 text-base font-black text-black hover:bg-green-400">YES — 60+</button>
          <button onClick={() => onVote("n")} className="rounded-xl bg-red-500 py-3 text-base font-black text-black hover:bg-red-400">NO</button>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">One tap — the crowd&apos;s call settles with your result.</p>
      </div>
    </div>
  );
}
