import React from "react";
import { BLUEPRINTS, type BlueprintKey } from "@/lib/blueprint";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";

/* Blueprint commitment — focus-trapped dialog gating the FIRST spin (commit before you see
   the reels). Confirm locks the objective for the game; Escape backs out to the mode picker. */
export function BlueprintDialog({ bpPick, setBpPick, onCommit, onCancel, dialogRef }: {
  bpPick: BlueprintKey | null; setBpPick: (k: BlueprintKey) => void;
  onCommit: (k: BlueprintKey) => void; onCancel: () => void;
  dialogRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Blueprint commitment"
      onKeyDown={(e) => {
        // radiogroup keyboard contract: arrows move the selection (Tab alone only walks focus)
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const i = BLUEPRINTS.findIndex((b) => b.key === bpPick);
          const n = BLUEPRINTS.length;
          // radiogroup contract: with nothing selected (i === -1), ArrowDown starts at the
          // first option and ArrowUp at the LAST — the modulo alone lands one short on ArrowUp
          const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1
            : e.key === "ArrowDown" ? (i + 1 + n) % n
            : i === -1 ? n - 1 : (i - 1 + n) % n;
          setBpPick(BLUEPRINTS[next].key);
          dialogRef.current?.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
          return;
        }
        buildFocusTrapHandler(dialogRef, () => onCancel(), { forwardFromContainer: true })(e);
      }}
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none backdrop-blur-sm sm:items-center">
      <div className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <div className="text-center text-xs font-black uppercase tracking-widest text-cyan-400">📐 Blueprint</div>
        <p className="mt-2 text-center text-base font-semibold text-zinc-100">Commit to an objective — before you see the reels.</p>
        <p className="mt-1 text-center text-[11px] text-zinc-500">The engine grades your execution on that axis. Board score = wins × execution (×1.0–1.3).</p>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Blueprint choices">
          {BLUEPRINTS.map((b) => (
            <button key={b.key} role="radio" aria-checked={bpPick === b.key} onClick={() => setBpPick(b.key)}
              className={`w-full rounded-xl border px-4 py-2.5 text-left transition ${
                bpPick === b.key ? "border-cyan-400 bg-cyan-500/15" : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500"}`}>
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-bold ${bpPick === b.key ? "text-cyan-200" : "text-zinc-200"}`}>{b.emoji} {b.label}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">A+ {b.lowerIsBetter ? "≤" : "≥"} {b.format(b.bands[0])}</span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">{b.desc}</span>
            </button>
          ))}
        </div>
        <button onClick={() => bpPick && onCommit(bpPick)} disabled={!bpPick}
          className="mt-4 w-full rounded-xl bg-cyan-500 py-3 text-base font-black text-black hover:bg-cyan-400 disabled:opacity-40">
          🔒 Commit — spin the reels
        </button>
        <button onClick={onCancel} className="mt-2 w-full py-1 text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to all modes
        </button>
      </div>
    </div>
  );
}
