import React from "react";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";
import type { DraftCandidate, Slot } from "@/lib/types";

type Roster = Record<Slot, DraftCandidate | null>;

/* Factor Hunt prediction — focus-trapped dialog between "five locked" and the reveal.
   Lock applies the ×1.05 board bonus if right; Escape or Skip reveals with no bonus. */
export function FhDialog({ fhStep, fhPick, setFhPick, lockFh, dialogRef }: {
  fhStep: { roster: Roster; ask: "worst" | "best"; choices: string[] };
  fhPick: string | null; setFhPick: (c: string) => void;
  lockFh: (choice: string | null) => void;
  dialogRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Factor Hunt prediction"
      onKeyDown={(e) => buildFocusTrapHandler(dialogRef, () => lockFh(null))(e)}
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none backdrop-blur-sm sm:items-center">
      <div className="animate-slide-up w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <div className="text-center text-xs font-black uppercase tracking-widest text-violet-400">🔮 Factor Hunt</div>
        <p className="mt-2 text-center text-base font-semibold text-zinc-100">
          {fhStep.ask === "worst"
            ? "Before the reveal — which factor is hurting this five the most?"
            : "Clean build, no weaknesses — which factor is helping the MOST?"}
        </p>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Factor choices">
          {fhStep.choices.map((c) => (
            <button key={c} role="radio" aria-checked={fhPick === c} onClick={() => setFhPick(c)}
              className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition ${
                fhPick === c ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-500"}`}>
              {c}
            </button>
          ))}
        </div>
        <button onClick={() => fhPick && lockFh(fhPick)} disabled={!fhPick}
          className="mt-4 w-full rounded-xl bg-violet-500 py-3 text-base font-black text-black hover:bg-violet-400 disabled:opacity-40">
          🔒 Lock prediction — ×1.05 if right
        </button>
        <button onClick={() => lockFh(null)} className="mt-2 w-full py-1 text-xs text-zinc-500 hover:text-zinc-300">
          Skip — just show the result
        </button>
      </div>
    </div>
  );
}
