import React, { useEffect } from "react";
import type { DraftCandidate } from "@/lib/types";
import { eraLabel } from "@/lib/teams";
import { ZRadar } from "./ZRadar";
import { buildFocusTrapHandler } from "./useFocusTrap";

// Pre-pick, side-by-side player comparison: real box stats + a z-score radar. Purely descriptive —
// the higher value is brightened (never green/red, which carry win-loss meaning), and there is NO
// "better pick" conclusion. The radar shows player shape, not lineup fit (DESIGN.md §12).

const A_COLOR = "#ff6a00"; // action orange (player A)
const B_COLOR = "#38bdf8"; // sky-400 — non-reserved, distinct from the mode-accent cyan (player B)
const ROWS: { k: "pts" | "trb" | "ast" | "stl" | "blk"; label: string }[] = [
  { k: "pts", label: "PPG" }, { k: "trb", label: "RPG" }, { k: "ast", label: "APG" },
  { k: "stl", label: "SPG" }, { k: "blk", label: "BPG" },
];
const lastName = (n: string) => n.split(" ").slice(-1)[0];

export function ComparePanel({ a, b, dialogRef, onClose, onPick }: {
  a: DraftCandidate; b: DraftCandidate; dialogRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void; onPick: (c: DraftCandidate) => void;
}) {
  useEffect(() => { dialogRef.current?.focus(); }, [dialogRef]); // move focus into the dialog for a11y
  const cell = (c: DraftCandidate, other: DraftCandidate, k: typeof ROWS[number]["k"]) => {
    const v = c[k], o = other[k];
    const hi = typeof v === "number" && (typeof o !== "number" || v >= o);
    return <span className={`tabular-nums ${hi ? "font-bold text-zinc-100" : "text-zinc-500"}`}>{v == null ? "–" : v.toFixed(1)}</span>;
  };
  const meta = (c: DraftCandidate) => `${c.team} · ${c.decade === "PRIME" ? "Prime" : eraLabel(c.decade)} · ${c.eligible.join("/")}`;
  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Compare players"
      onKeyDown={(e) => buildFocusTrapHandler(dialogRef, onClose)(e)}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none backdrop-blur-sm sm:items-center">
      <div className="animate-slide-up w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-orange-500">⚖️ Compare</span>
          <button onClick={onClose} aria-label="Close compare" className="px-2 text-zinc-400 hover:text-zinc-200">✕</button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          {[{ c: a, col: A_COLOR }, { c: b, col: B_COLOR }].map(({ c, col }) => (
            <div key={c.id} className="min-w-0">
              <div className="truncate text-sm font-bold" style={{ color: col }}>{c.name}</div>
              <div className="truncate text-[11px] text-zinc-500">{meta(c)}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1">
          {ROWS.map((r) => (
            <div key={r.k} className="grid grid-cols-[1fr_3rem_1fr] items-center gap-3 text-sm">
              <div className="text-right">{cell(a, b, r.k)}</div>
              <div className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-600">{r.label}</div>
              <div className="text-left">{cell(b, a, r.k)}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-center">
          <ZRadar players={[{ label: a.name, z: a.z, color: A_COLOR }, { label: b.name, z: b.z, color: B_COLOR }]} />
        </div>
        {(a.defense_estimated || b.defense_estimated) && (
          <p className="mt-1 text-center text-[10px] text-zinc-600">Pre-1974 defensive stats are estimated.</p>
        )}
        <p className="mt-2 text-center text-[11px] text-zinc-500">Real stats &amp; era standing — not a fit rating.</p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={() => onPick(a)} style={{ color: A_COLOR }}
            className="rounded-xl border border-zinc-700 py-2 text-sm font-bold hover:border-zinc-500">Pick {lastName(a.name)}</button>
          <button onClick={() => onPick(b)} style={{ color: B_COLOR }}
            className="rounded-xl border border-zinc-700 py-2 text-sm font-bold hover:border-zinc-500">Pick {lastName(b.name)}</button>
        </div>
      </div>
    </div>
  );
}
