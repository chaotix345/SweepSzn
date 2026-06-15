import React, { useState, useMemo } from "react";
import type { CandidateFit, DraftCandidate } from "@/lib/types";
import { teamColors, eraLabel } from "@/lib/teams";
import { TRAIT_META } from "@/lib/traits";
import type { Mode } from "@/components/game/types";

type Spin = { team: string; decade: string; candidates: DraftCandidate[] };
export type SortKey = "fit" | "ppg" | "rpg" | "apg" | "az";

// Decades that can contain pre-1985 players, whose box dominance the engine discounts (eraStrength,
// fullYear 1985). The badge tooltip discloses the RULE at draft time — it never shows a per-player
// number, so it stays a knowledge prompt ("older box scores are inflated") not solvable arithmetic.
const ERA_ADJUSTED = new Set(["1960s", "1970s", "1980s"]);
const ERA_ADJ_TIP = "Pre-1985 box stats are era-adjusted — discounted for the weaker, shallower early league.";

// color the fit swing: green shades by tier when it helps, muted when it doesn't move the needle
export function fitColor(f: CandidateFit): string {
  if (f.delta <= 0) return "text-zinc-500";
  return f.tier === "elite" ? "text-emerald-300" : f.tier === "strong" ? "text-emerald-400" : f.tier === "solid" ? "text-emerald-500/80" : "text-zinc-400";
}

export function Mini({ v, k, className }: { v: number | null | undefined; k: string; className?: string }) {
  return (
    <div className={`w-8 ${className ?? ""}`}>
      <div className="font-semibold text-zinc-300 tabular-nums">{v == null ? "–" : v.toFixed(1)}</div>
      <div className="text-[8px] uppercase tracking-wide text-zinc-500">{k}</div>
    </div>
  );
}

export function Browser({ spin, mode, selId, hintsLeft, onReveal, canPlace, onSelect, showUsage }: {
  spin: Spin; mode: Mode; selId: string | null; hintsLeft: number; onReveal: () => void;
  canPlace: (c: DraftCandidate) => boolean; onSelect: (c: DraftCandidate) => void; showUsage?: boolean;
}) {
  const hideStats = mode === "hoopiq"; // HoopIQ hides stats — draft on memory
  // Classic-style assist (Classic + Prime + Blueprint — Blueprint follows Classic's hint rules,
  // hinted board rows carry the stamp): Daily/FH are hint-free competitions, HoopIQ is a memory test
  const canHint = mode === "classic" || mode === "prime" || mode === "blueprint";
  const [revealed, setRevealed] = useState(false); // spent a hint to reveal fit for THIS pick? resets on remount (each spin/round)
  const showFit = revealed && canHint;
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<"All" | "G" | "F" | "C">("All");
  // Neutral default sort (A–Z): PPG-default actively steered players toward the high-scorer trap the
  // engine punishes. Keep PPG as an option — just don't make the trap the path of least resistance.
  const [sort, setSort] = useState<SortKey>(showFit ? "fit" : "az");
  // if Hints is switched off mid-spin while sorted by fit, fall back to the neutral default
  const effSort: SortKey = sort === "fit" && !showFit ? "az" : sort;

  const list = useMemo(() => {
    const inGroup = (c: DraftCandidate) =>
      group === "All" ? true :
      group === "G" ? c.eligible.some((p) => p === "PG" || p === "SG") :
      group === "F" ? c.eligible.some((p) => p === "SF" || p === "PF") :
      c.eligible.includes("C");
    const out = spin.candidates.filter((c) => inGroup(c) && c.name.toLowerCase().includes(q.toLowerCase().trim()));
    const key: Record<SortKey, (c: DraftCandidate) => number> = {
      fit: (c) => -(c.fit?.delta ?? -99), ppg: (c) => -(c.pts ?? 0), rpg: (c) => -(c.trb ?? 0), apg: (c) => -(c.ast ?? 0), az: () => 0,
    };
    out.sort((a, b) => (effSort === "az" ? a.name.localeCompare(b.name) : key[effSort](a) - key[effSort](b)));
    return out;
  }, [spin, q, group, effSort]);

  const c0 = teamColors(spin.team);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 p-2.5">
        {hideStats ? (
          <span title="Team & era are hidden in HoopIQ — recognize the players" className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-bold text-zinc-300">🧠 Mystery roster</span>
        ) : (
          <>
            <span className="rounded-md px-2 py-1 text-xs font-black" style={{ background: c0.bg, color: c0.text }}>{spin.team}</span>
            <span title={ERA_ADJUSTED.has(spin.decade) ? ERA_ADJ_TIP : undefined}
              className="rounded-md bg-violet-500/20 px-2 py-1 text-xs font-bold text-violet-300">{eraLabel(spin.decade)}{ERA_ADJUSTED.has(spin.decade) && <span className="ml-1 opacity-70" aria-hidden>✳</span>}</span>
          </>
        )}
        <div className="ml-auto flex gap-1">
          {(["All", "G", "F", "C"] as const).map((g) => (
            <button key={g} onClick={() => setGroup(g)}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${group === g ? "bg-orange-500 text-black" : "text-zinc-400 hover:text-zinc-200"}`}>{g}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search players"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm outline-none focus:border-orange-500 sm:w-36" />
        {canHint && (revealed ? (
          <span title="Fit grades revealed for this pick (cost 1 hint)" className="rounded-md bg-emerald-500/20 px-2 py-1.5 text-xs font-semibold text-emerald-300">
            💡 Hints on
          </span>
        ) : hintsLeft > 0 ? (
          <button onClick={() => { onReveal(); setRevealed(true); }} title={`Spend 1 hint to reveal the engine's fit grades for this pick — ${hintsLeft} left this game`}
            className="rounded-md border border-zinc-700 px-2 py-1.5 text-xs font-semibold text-zinc-400 transition hover:border-emerald-600/60 hover:text-emerald-300">
            💡 Hints · {hintsLeft} left
          </button>
        ) : (
          <span title="You've used all your hints this game" className="rounded-md border border-zinc-800 px-2 py-1.5 text-xs font-semibold text-zinc-500">
            💡 Hints used up
          </span>
        ))}
        {!hideStats && (
          <select value={effSort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort players"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none">
            {showFit && <option value="fit">Best fit</option>}
            <option value="az">A–Z</option><option value="ppg">PPG</option><option value="rpg">RPG</option><option value="apg">APG</option>
          </select>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-zinc-500">
        <span>{list.length} player{list.length === 1 ? "" : "s"} available{hideStats ? " · stats hidden" : ""}</span>
        {showFit && <span className="text-zinc-500">fit = net swing for <span className="text-zinc-400">your</span> roster</span>}
      </div>
      <div className="max-h-[420px] overflow-y-auto px-2 pb-2">
        {list.map((c) => {
          const sel = selId === c.id;
          const fits = canPlace(c);
          const showRowFit = showFit && fits && c.fit;
          return (
            <button key={c.id} onClick={() => onSelect(c)} aria-pressed={sel}
              aria-label={`Select ${c.name}, plays ${c.eligible.join("/")}${fits ? "" : ", no open slot"}${showUsage && c.usage != null ? `, ${Math.round(c.usage)} percent usage demand` : ""}${showRowFit ? `, fit ${c.fit!.delta > 0 ? "+" : ""}${c.fit!.delta}${c.fit!.adds.length ? ", adds " + c.fit!.adds.join(" and ") : ""}` : ""}`}
              className={`mb-1.5 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition active:scale-[0.98] ${
                sel ? "border-orange-500 bg-orange-500/10"
                  : showRowFit && c.fit!.best ? "border-emerald-600/50 bg-emerald-500/[0.06] shadow-[0_0_14px_-4px_rgba(52,211,153,0.45)] hover:-translate-y-px hover:border-emerald-500"
                  : fits ? "border-zinc-800 bg-zinc-950/60 hover:-translate-y-px hover:border-zinc-600"
                  : "border-zinc-900 bg-zinc-950/40 opacity-55"}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{c.name}</div>
                <div className="text-[11px] text-zinc-500">
                  {c.eligible.join(" · ")}
                  {/* Prime pools span all eras — show each player's peak decade on the row */}
                  {spin.decade === "PRIME" && <span className="ml-1 text-violet-400/80" title={ERA_ADJUSTED.has(c.decade) ? ERA_ADJ_TIP : undefined}>· {eraLabel(c.decade)}{ERA_ADJUSTED.has(c.decade) && <span className="ml-0.5 opacity-70" aria-hidden>✳</span>}</span>}
                  {!fits && <span className="ml-1 text-zinc-500">· no open slot</span>}
                </div>
                {!hideStats && c.traits && c.traits.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.traits.slice(0, 2).map((t) => (
                      <span key={t} title={TRAIT_META[t].desc}
                        className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                        {TRAIT_META[t].icon} {TRAIT_META[t].label}
                      </span>
                    ))}
                  </div>
                )}
                {showRowFit && c.fit!.adds.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.fit!.adds.map((a) => (
                      <span key={a} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400/90">+ {a}</span>
                    ))}
                  </div>
                )}
              </div>
              {!hideStats && (
                <div className="flex shrink-0 gap-2 text-center text-[11px] text-zinc-400">
                  <Mini v={c.pts} k="PPG" /><Mini v={c.trb} k="RPG" /><Mini v={c.ast} k="APG" />
                  {/* SPG/BPG hidden on mobile to make room for the fit column; defense shows via fit tags */}
                  <Mini v={c.stl} k="SPG" className="hidden sm:block" /><Mini v={c.blk} k="BPG" className="hidden sm:block" />
                  {/* USAGE DISCIPLINE drafts against a budget — the demand column IS the mechanic */}
                  {showUsage && <Mini v={c.usage} k="USG%" />}
                </div>
              )}
              {showRowFit && (
                <div className="w-10 shrink-0 text-right">
                  <div className={`text-sm font-bold tabular-nums ${fitColor(c.fit!)}`}>{c.fit!.delta > 0 ? "+" : ""}{c.fit!.delta}</div>
                  <div className={`text-[8px] uppercase tracking-wide ${c.fit!.best ? "text-emerald-300" : "text-zinc-400"}`}>{c.fit!.best ? "★ fit" : "fit"}</div>
                </div>
              )}
            </button>
          );
        })}
        {list.length === 0 && <div className="py-8 text-center text-xs text-zinc-500">No players match.</div>}
      </div>
    </div>
  );
}
