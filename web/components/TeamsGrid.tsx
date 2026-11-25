"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { gradeColor } from "@/lib/grades";
import { teamColors } from "@/lib/teams";

export type TeamCard = {
  team: string; name: string; path: string;
  record: { wins: number; losses: number; grade: string } | null;
  names: string[]; // the five's display names, slot order
};

type Sort = "wins" | "az";

// F21: the 30-franchise grid with a sort (by projected wins / A–Z) and a quick filter on team or
// player name. Server-rendered in A–Z order (the default here) so the page is crawlable as before.
export default function TeamsGrid({ teams }: { teams: TeamCard[] }) {
  const [sort, setSort] = useState<Sort>("az");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (t: TeamCard) => !needle || t.name.toLowerCase().includes(needle) || t.team.toLowerCase() === needle || t.names.some((n) => n.toLowerCase().includes(needle));
    const out = teams.filter(hit);
    if (sort === "wins") out.sort((a, b) => (b.record?.wins ?? -1) - (a.record?.wins ?? -1) || a.name.localeCompare(b.name));
    return out;
  }, [teams, sort, q]);

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Sort franchises" className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-xs font-semibold">
          {([["wins", "By wins"], ["az", "A–Z"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k}
              className={`min-h-11 rounded-md px-3 sm:min-h-9 ${sort === k ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}>{label}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Filter by team or player" aria-label="Filter franchises by team or player"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-400 focus:border-zinc-600 sm:max-w-xs" />
        <span className="text-xs text-zinc-400" aria-live="polite">{shown.length === teams.length ? `${teams.length} franchises` : `${shown.length} of ${teams.length}`}</span>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => {
          const c = teamColors(t.team);
          const grade = t.record ? gradeColor(t.record.grade) : "";
          return (
            <li key={t.team}>
              <Link
                href={t.path}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:border-zinc-600"
              >
                <div aria-hidden className="h-1.5" style={{ background: c.bg }} />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                      style={{ background: c.bg, color: c.text }}
                    >
                      {t.team}
                    </span>
                    <span className="font-bold text-zinc-100">{t.name}</span>
                  </div>
                  {t.record ? (
                    <>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className={`font-display text-3xl tabular-nums ${grade}`}>
                          {t.record.wins}<span className="text-zinc-600">–</span>{t.record.losses}
                        </span>
                        <span className={`text-sm font-bold ${grade}`}>{t.record.grade}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t.names.join(" · ")}</p>
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-zinc-400">Legends by decade</p>
                  )}
                  <span className="mt-auto pt-3 text-xs font-semibold text-zinc-400 transition group-hover:text-zinc-200">
                    See the five →
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="mt-6 text-sm text-zinc-400">No franchise matches “{q.trim()}”.</p>}
    </>
  );
}
