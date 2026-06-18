"use client";
import { useState } from "react";
import { track } from "@vercel/analytics";
import type { Player, Slot, DraftCandidate } from "@/lib/types";
import { gradeColor } from "@/lib/grades";

// Post-game What-If Lab: swap any player for an alternative from that slot's team+era pool, re-score
// the season live, and watch the record move. Pure post-commit learning — the round is already
// decided, so full transparency is fair (DESIGN.md §12). Options are fame-sorted, never by outcome.

interface Pick5 { id: string; name: string }
interface Sim { wins: number; losses: number; grade: string }

export function WhatIfLab({ players, slots, baseWins, baseLosses, baseGrade }: {
  players: Player[]; slots: Slot[]; baseWins: number; baseLosses: number; baseGrade: string;
}) {
  const original: Pick5[] = players.map((p) => ({ id: p.id, name: p.name }));
  const [open, setOpen] = useState(false);
  const [lineup, setLineup] = useState<Pick5[]>(original);
  const [sim, setSim] = useState<Sim | null>(null);
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [opts, setOpts] = useState<DraftCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);

  const cur = sim ?? { wins: baseWins, losses: baseLosses, grade: baseGrade };
  const delta = sim ? sim.wins - baseWins : 0;
  const changed = lineup.some((p, i) => p.id !== original[i].id);

  async function showOptions(i: number) {
    if (openSlot === i) { setOpenSlot(null); return; }
    setOpenSlot(i); setOpts(null);
    try {
      const r = await fetch(`/api/swap-options?team=${players[i].team}&decade=${players[i].decade}&slot=${slots[i]}`);
      setOpts(r.ok ? (await r.json()).candidates : []);
    } catch { setOpts([]); }
  }

  async function pick(i: number, c: DraftCandidate) {
    const next = lineup.map((p, j) => (j === i ? { id: c.id, name: c.name } : p));
    setLineup(next); setOpenSlot(null); setBusy(true);
    try {
      const r = await fetch("/api/evaluate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
      if (r.ok) { const d = await r.json(); setSim({ wins: d.result.wins, losses: d.result.losses, grade: d.result.grade }); }
    } catch { /* keep the last good sim */ } finally { setBusy(false); }
  }

  function reset() { setLineup(original); setSim(null); setOpenSlot(null); }

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); track("whatif_open", { grade: baseGrade, wins: baseWins }); }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 py-2.5 text-sm font-bold text-zinc-300 transition hover:border-orange-600/60 hover:text-orange-300">
        🧪 Open the What-If Lab — swap a player, watch the season change
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-widest text-orange-500">🧪 What-If Lab</span>
        <div className="flex items-center gap-2">
          {changed && <button onClick={reset} className="text-[11px] text-zinc-400 hover:text-zinc-200">Reset</button>}
          <button onClick={() => { setOpen(false); reset(); }} aria-label="Close lab" className="px-1 text-zinc-400 hover:text-zinc-200">✕</button>
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-3">
        <span className={`font-display text-3xl tabular-nums ${gradeColor(cur.grade)}`}>{cur.wins}&ndash;{cur.losses}</span>
        <span className={`text-xs font-bold ${gradeColor(cur.grade)}`}>{cur.grade}</span>
        {sim
          ? <span className={`text-sm font-bold ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-zinc-500"}`}>{delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "±0"} wins</span>
          : <span className="text-xs text-zinc-500">your result{busy ? " · simulating…" : ""}</span>}
      </div>

      <div className="mt-3 space-y-1">
        {lineup.map((p, i) => (
          <div key={slots[i]}>
            <div className="flex items-center gap-2 rounded-lg bg-zinc-900/50 px-2.5 py-1.5 text-sm">
              <span className="w-7 text-[11px] font-bold text-zinc-500">{slots[i]}</span>
              <span className={`truncate ${p.id !== original[i].id ? "text-orange-300" : ""}`}>{p.name}</span>
              <button onClick={() => showOptions(i)}
                className="ml-auto rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200">
                {openSlot === i ? "Close" : "Swap"}
              </button>
            </div>
            {openSlot === i && (
              <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-1">
                {opts === null && <div className="px-2 py-2 text-xs text-zinc-500">Loading…</div>}
                {opts && opts.filter((c) => c.id !== p.id).length === 0 && <div className="px-2 py-2 text-xs text-zinc-500">No other options for this slot.</div>}
                {opts && opts.filter((c) => c.id !== p.id).map((c) => (
                  <button key={c.id} onClick={() => pick(i, c)} disabled={busy}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-800/60 disabled:opacity-50">
                    <span className="truncate font-semibold">{c.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">{(c.pts ?? 0).toFixed(1)} · {(c.trb ?? 0).toFixed(1)} · {(c.ast ?? 0).toFixed(1)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-600">The round is already scored — this is a sandbox to learn from, not your record. Options are listed by fame, never by outcome.</p>
    </div>
  );
}
