import React from "react";
import { displayName, eraLabel } from "@/lib/teams";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";
import type { DraftCandidate, Slot } from "@/lib/types";
import type { SurgeonCandidate, SurgeonDiagnosis } from "@/lib/surgeon";

type SgPool = { diagnosis: SurgeonDiagnosis; before: { wins: number; losses: number; net: number; grade: string }; candidates: SurgeonCandidate[]; roster: { slot: Slot; player: DraftCandidate }[] };

/* Surgeon phase 2 — focus-trapped "Replacement Pool" dialog (spec's anti-"rigged" labelling:
   each candidate shows WHY it was offered). Pick a candidate, then which of your five to drop
   (only slot-eligible targets are offered); confirm submits the swap (the reveal IS the submit). */
export function SurgeonDialog({ sgPool, sgInId, setSgInId, sgOutId, setSgOutId, sgName, setSgName, sgBusy, error, confirmSurgeon, dismissPool, dialogRef }: {
  sgPool: SgPool; sgInId: string | null; setSgInId: (id: string) => void;
  sgOutId: string | null; setSgOutId: (id: string) => void;
  sgName: string; setSgName: (n: string) => void;
  sgBusy: boolean; error: string | null;
  confirmSurgeon: () => void; dismissPool: () => void;
  dialogRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Surgeon replacement pool"
      onKeyDown={(e) => {
        // radiogroup keyboard contract: arrows rove WITHIN whichever group holds focus
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
          const group = (document.activeElement as HTMLElement | null)?.closest("[role=radiogroup]");
          if (!group) return;
          e.preventDefault();
          const radios = [...group.querySelectorAll<HTMLElement>("[role=radio]:not([disabled])")];
          if (!radios.length) return;
          const i = radios.indexOf(document.activeElement as HTMLElement);
          const n = radios.length;
          const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1
            : e.key === "ArrowDown" ? (i + 1 + n) % n : (i - 1 + n) % n;
          radios[next].focus(); radios[next].click();
          return;
        }
        buildFocusTrapHandler(dialogRef, () => dismissPool(), { forwardFromContainer: true, selector: "button:not([disabled]), input:not([disabled])" })(e);
      }}
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none backdrop-blur-sm sm:items-center">
      <div className="animate-slide-up max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <div className="text-center text-xs font-black uppercase tracking-widest text-rose-400">🩺 Diagnosis</div>
        <p className="mt-2 text-center text-base font-semibold text-zinc-100">
          {sgPool.diagnosis.kind === "worst" ? "Your worst factor: " : "No real weaknesses — your weakest strength: "}
          <span className="text-rose-300">{sgPool.diagnosis.label}</span>
        </p>
        <p className="mt-1 text-center text-[11px] text-zinc-500">
          {sgPool.before.wins}-{sgPool.before.losses} before the fix · one swap, score = win delta
        </p>

        <div className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Replacement pool — pick one</div>
        <div className="mt-1.5 space-y-2" role="radiogroup" aria-label="Replacement candidates">
          {sgPool.candidates.map((c) => (
            <button key={c.id} role="radio" aria-checked={sgInId === c.id}
              onClick={() => { setSgInId(c.id); setSgOutId(null as unknown as string); }}
              className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                sgInId === c.id ? "border-rose-400 bg-rose-500/15" : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500"}`}>
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-bold ${sgInId === c.id ? "text-rose-200" : "text-zinc-200"}`}>{displayName(c.name)}</span>
                <span className="shrink-0 text-[10px] text-zinc-500">{c.team} · {eraLabel(c.decade)}</span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-emerald-400/90">{c.why}</span>
            </button>
          ))}
        </div>

        {sgInId && (() => {
          const cand = sgPool.candidates.find((c) => c.id === sgInId)!;
          // a candidate may only take the EXACT slot the drafted player occupies (server rule)
          return (
            <>
              <div role="status" aria-live="polite" className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Swap out — pick the player {displayName(cand.name)} replaces</div>
              <div className="mt-1.5 grid grid-cols-1 gap-1.5" role="radiogroup" aria-label="Player to swap out">
                {sgPool.roster.map(({ slot, player }) => {
                  const eligible = cand.eligible.includes(slot);
                  return (
                    // aria-disabled (not disabled) keeps ineligible targets discoverable to AT
                    // users inside the radiogroup; the click guard makes them inert
                    <button key={player.id} role="radio" aria-checked={sgOutId === player.id} aria-disabled={!eligible}
                      onClick={() => eligible && setSgOutId(player.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                        sgOutId === player.id ? "border-red-400 bg-red-500/15 text-red-200"
                          : eligible ? "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-500" : "border-zinc-900 bg-zinc-950/40 text-zinc-600"}`}>
                      <span className="truncate font-semibold">{displayName(player.name)} <span className="text-[10px] font-normal text-zinc-500">at {slot}</span></span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{eligible ? `${cand.pos} fits ${slot}` : `can't play ${slot}`}</span>
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}

        <input value={sgName} onChange={(e) => setSgName(e.target.value)} maxLength={24} placeholder="Your name (for the board)"
          className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-rose-500" />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <button onClick={confirmSurgeon} disabled={!sgInId || !sgOutId || sgBusy}
          className="mt-3 w-full rounded-xl bg-rose-500 py-3 text-base font-black text-black hover:bg-rose-400 disabled:opacity-40">
          {sgBusy ? "Operating…" : "🔒 Confirm swap — reveal the delta"}
        </button>
        <button onClick={dismissPool}
          className="mt-2 w-full py-1 text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to the draft
        </button>
        <p className="mt-2 text-center text-[10px] text-zinc-500">One swap, locked on submit — the result reveals the answer.</p>
      </div>
    </div>
  );
}
