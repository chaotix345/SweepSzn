import React, { useEffect, useState } from "react";
import type { DraftCandidate } from "@/lib/types";
import { sigmaText, barPct } from "@/lib/era";
import { eraLabel } from "@/lib/teams";

// Inline player dossier: who this player was. Accolades + career arc + era-relative stat bars + the
// season context the lean candidate doesn't carry (age/games/minutes/TS%). Fetched on expand. Purely
// descriptive — real greatness is not this engine's reward, so it never hints the draft (DESIGN.md §12).

interface DossierData {
  accoladeLine: string;
  journey: { team: string; decade: string; peak: boolean }[];
  age: number | null; g: number | null; mp: number | null; ts: number | null;
  defense_estimated: boolean;
}

const BARS: { k: "pts" | "trb" | "ast"; label: string }[] = [
  { k: "pts", label: "PTS" }, { k: "trb", label: "REB" }, { k: "ast", label: "AST" },
];

// Accepts anything carrying the descriptive fields the dossier reads — the lean DraftCandidate from
// the draft board, or a full Player from the result card's roster rows (both supersets of this Pick).
export function Dossier({ cand }: { cand: Pick<DraftCandidate, "id" | "z" | "pts" | "trb" | "ast"> }) {
  const [data, setData] = useState<DossierData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/player/${cand.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: DossierData) => { if (alive) setData(d); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [cand.id]);

  return (
    <div className="mt-px rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-3">
      {!data && !err && <div className="text-xs text-zinc-500">Loading…</div>}
      {err && <div className="text-xs text-zinc-500">Couldn&apos;t load player details.</div>}
      {data && (
        <>
          <div className="text-xs font-semibold text-zinc-100">{data.accoladeLine || "No major awards"}</div>
          {data.journey.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {data.journey.map((s) => (
                <span key={`${s.team}|${s.decade}`}
                  className={`rounded-full px-2 py-0.5 text-[10px] ${s.peak ? "bg-orange-500/15 text-orange-300" : "bg-zinc-800/70 text-zinc-400"}`}>
                  {s.team} {eraLabel(s.decade)}{s.peak ? " ★" : ""}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {BARS.map((b) => {
              const z = cand.z?.[b.k];
              const raw = cand[b.k];
              return (
                <div key={b.k} className="grid grid-cols-[34px_44px_1fr_56px] items-center gap-2 text-[11px]">
                  <span className="font-bold uppercase tracking-wide text-zinc-500">{b.label}</span>
                  <span className="tabular-nums text-zinc-200">{raw == null ? "–" : raw.toFixed(1)}</span>
                  <span className="block h-1.5 overflow-hidden rounded bg-zinc-800">
                    <span className="block h-full rounded bg-gradient-to-r from-orange-600 to-orange-400" style={{ width: `${barPct(z)}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-zinc-400">{sigmaText(z) || "—"}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-zinc-800/70 pt-2 text-[11px] text-zinc-500">
            {data.age != null && <span><b className="text-zinc-400">Age</b> {data.age}</span>}
            {data.g != null && <span><b className="text-zinc-400">GP</b> {data.g}</span>}
            {data.mp != null && <span><b className="text-zinc-400">MPG</b> {data.mp.toFixed(1)}</span>}
            {data.ts != null && <span><b className="text-zinc-400">TS%</b> {(data.ts * 100).toFixed(1)}</span>}
            {data.defense_estimated && <span className="text-zinc-600">· defense estimated</span>}
          </div>
          <div className="mt-2 text-[10px] text-zinc-600">Real career &amp; stats vs his era — not a fit rating.</div>
        </>
      )}
    </div>
  );
}
