"use client";
import Link from "next/link";
import type { LineupResult, Player } from "@/lib/types";
import type { SurgeonDiagnosis } from "@/lib/surgeon";
import { teamColors, initials, eraLabel, displayName } from "@/lib/teams";
import { factorViews } from "@/lib/explain";
import { ShareButton, SaveCardImage } from "@/components/ResultCard";
import { GRADE_COLOR } from "@/lib/grades";

// Surgeon result: the delta IS the story. BEFORE/AFTER records and factor breakdowns side by
// side, the diagnosis that drove the deal, and the one swap that moved the needle. Used by the
// game's reveal and by the /sg/ permalink (shared), like ResultCard is for single-lineup modes.


export default function SurgeonResult({
  before, after, beforePlayers, afterPlayers, outIdx, diagnosis, card, shared, onReset,
}: {
  before: LineupResult; after: LineupResult; beforePlayers: Player[]; afterPlayers: Player[];
  outIdx: number; diagnosis: SurgeonDiagnosis; card: string; shared?: boolean; onReset?: () => void;
}) {
  const delta = after.wins - before.wins;
  const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-zinc-300";
  const outP = beforePlayers[outIdx], inP = afterPlayers[outIdx];
  const names = afterPlayers.map((p) => displayName(p.name));
  const text = `One swap, ${delta > 0 ? "+" : ""}${delta} wins — ${before.wins}-${before.losses} → ${after.wins}-${after.losses} on today's SweepSzn Surgeon (diagnosis: ${diagnosis.canonical}). Can you out-operate me?`;

  return (
    <div className="animate-rise-in mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {/* hero: the delta — the Surgeon buzzer moment (slams in like the main reveal's record) */}
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 pt-6 pb-5 text-center">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Surgeon · win delta</div>
        <div className={`animate-record-slam mt-1 font-display text-7xl tabular-nums ${deltaColor}`}>
          {delta > 0 ? "+" : ""}{delta}
        </div>
        <div className="mt-1 flex items-center justify-center gap-3 text-lg font-bold tracking-wide">
          <span className={GRADE_COLOR[before.grade] ?? "text-zinc-300"}>{before.wins}-{before.losses}</span>
          <span aria-hidden className="text-zinc-600">→</span>
          <span className={GRADE_COLOR[after.grade] ?? "text-zinc-300"}>{after.wins}-{after.losses}</span>
        </div>
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300"
          title={diagnosis.kind === "worst" ? "The engine's highest-magnitude negative factor" : "No negative factors — this was your weakest strength"}>
          🩺 Diagnosis: {diagnosis.label}{diagnosis.kind === "weakest" ? " (weakest strength)" : ""}
        </div>
        {/* the swap */}
        <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-3 text-sm">
          <SwapChip p={outP} out />
          <span aria-hidden className="shrink-0 text-lg text-zinc-500">→</span>
          <SwapChip p={inP} />
        </div>
      </div>

      {/* before/after factor breakdown — the delta story, side by side */}
      <div className="border-t border-zinc-800 px-6 py-5">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">What the swap changed</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FactorList title={`Before · ${before.wins}-${before.losses}`} result={before} />
          <FactorList title={`After · ${after.wins}-${after.losses}`} result={after} highlight />
        </div>
        <div className="mt-3 flex justify-center gap-2 text-xs text-zinc-400">
          <span className="rounded-lg bg-zinc-800/60 px-2.5 py-1">Net {fmtNet(before.netRtg)} → <b className={after.netRtg >= before.netRtg ? "text-green-400" : "text-red-400"}>{fmtNet(after.netRtg)}</b></span>
        </div>
      </div>

      {/* the five, post-op */}
      <div className="border-t border-zinc-800 px-4 py-4">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Your five, post-op</div>
        <div className="space-y-1.5">
          {afterPlayers.map((p, i) => {
            const c = teamColors(p.team);
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${i === outIdx ? "bg-green-500/[0.07] ring-1 ring-green-500/30" : "bg-zinc-950/60"}`}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-black" style={{ background: c.bg, color: c.text }}>
                  {initials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-zinc-500">{p.team} · {eraLabel(p.decade)}</span>
                </div>
                {i === outIdx && <span className="shrink-0 text-[10px] font-bold uppercase text-green-400">swapped in</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-zinc-800 px-6 py-4">
        <div className="flex gap-3">
          <ShareButton result={after} path={`/sg/${card}`} names={names} text={text} />
          {shared ? (
            <Link href="/play?mode=surgeon" className="flex-1 rounded-xl bg-orange-500 py-2.5 text-center text-sm font-bold text-black hover:bg-orange-400">Fix your own five →</Link>
          ) : (
            <button onClick={onReset} className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-black hover:bg-orange-400">Operate Again</button>
          )}
        </div>
        <SaveCardImage path={`/sg/${card}`} />
      </div>
    </div>
  );
}

const fmtNet = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function SwapChip({ p, out }: { p: Player; out?: boolean }) {
  const c = teamColors(p.team);
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 ${out ? "border-red-500/40 bg-red-500/[0.06]" : "border-green-500/40 bg-green-500/[0.06]"}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-black" style={{ background: c.bg, color: c.text }}>
        {initials(p.name)}
      </div>
      <div className="min-w-0 text-left">
        <div className="truncate text-xs font-semibold">{displayName(p.name)}</div>
        <div className={`text-[10px] font-bold uppercase ${out ? "text-red-400" : "text-green-400"}`}>{out ? "out" : "in"}</div>
      </div>
    </div>
  );
}

function FactorList({ title, result, highlight }: { title: string; result: LineupResult; highlight?: boolean }) {
  const factors = factorViews(result);
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-zinc-950/70 ring-1 ring-zinc-700" : "bg-zinc-950/40"}`}>
      <div className="mb-1.5 text-[11px] font-semibold text-zinc-500">{title}</div>
      <div className="space-y-1.5">
        {factors.map((f, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-zinc-300">{f.label}</span>
            <span className={`shrink-0 tabular-nums font-semibold ${f.value > 0 ? "text-green-400" : "text-red-400"}`}>
              {f.value > 0 ? "+" : ""}{f.value.toFixed(1)}
            </span>
          </div>
        ))}
        {factors.length === 0 && <div className="text-xs text-zinc-500">—</div>}
      </div>
    </div>
  );
}
