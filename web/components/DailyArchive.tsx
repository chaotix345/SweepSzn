"use client";
import { useEffect, useMemo, useState } from "react";
import CeilingReveal from "@/components/CeilingReveal";
import { ButtonLink } from "@/components/ui/Button";
import { archiveDays, archiveDay } from "@/lib/day";
import { playedDays, bestWins, type DayPlay } from "@/lib/archiveHistory";
import { cn } from "@/lib/cn";

type Filter = "all" | "unplayed" | "played";
const FILTERS: [Filter, string][] = [["all", "All"], ["unplayed", "Not played"], ["played", "Played"]];
const PAGE = 31;

const dayMs = (key: string) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const rowLabel = (key: string) => new Date(dayMs(key)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const monthLabel = (key: string) => new Date(dayMs(key)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function Status({ p }: { p?: DayPlay }) {
  if (!p) return <span className="text-xs text-zinc-500">Not played</span>;
  const d = p.daily?.wins, r = p.replay?.wins;
  return (
    <span className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
      {p.daily && (
        <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-orange-300" title="You played this Daily on the day">
          ✓ Played{d != null && <span className="tabular-nums"> · {d}-{82 - d}</span>}
        </span>
      )}
      {r != null && <span className="rounded-full bg-zinc-800 px-2 py-0.5 tabular-nums text-zinc-300" title="Your best unranked replay">Replay · {r}-{82 - r}</span>}
    </span>
  );
}

// W3 past-Daily archive: every rolled-over Daily from the first one to yesterday, which ones this device
// has played (on the day or as a replay), a replay link (unranked, that day's pool) and the revealed
// perfect five. Everything is time- and storage-dependent, so it renders after mount.
export default function DailyArchive() {
  const [data, setData] = useState<{ days: string[]; played: Record<string, DayPlay>; focus: string | null } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    (async () => {
      const days = archiveDays();
      let played: Record<string, DayPlay> = {};
      try { played = playedDays(); } catch { /* private mode */ }
      let focus: string | null = null;
      try { focus = archiveDay(new URLSearchParams(window.location.search).get("d")); } catch { /* no URL */ }
      setData({ days, played, focus });
      if (focus) { setOpen(focus); setLimit(Math.max(PAGE, days.indexOf(focus) + 1)); }
    })();
  }, []);

  useEffect(() => {
    if (!data?.focus) return;
    const t = setTimeout(() => document.getElementById(`day-${data.focus}`)?.scrollIntoView({ block: "center" }), 50);
    return () => clearTimeout(t);
  }, [data]);

  const shown = useMemo(() => {
    if (!data) return [];
    return data.days.filter((d) => filter === "all" || (filter === "played") === !!data.played[d]);
  }, [data, filter]);

  if (!data) return <div className="mt-8 h-64 animate-pulse rounded-2xl bg-zinc-900" aria-hidden />;
  const playedCount = data.days.filter((d) => data.played[d]).length;
  const visible = shown.slice(0, limit);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400" data-testid="archive-count"><span className="font-semibold tabular-nums text-zinc-200">{playedCount}</span> of <span className="tabular-nums">{data.days.length}</span> played on this device</p>
        <div role="group" aria-label="Filter days" className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-xs font-semibold">
          {FILTERS.map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}
              className={cn("min-h-11 rounded-md px-3", filter === k ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200")}>{label}</button>
          ))}
        </div>
      </div>

      {visible.length === 0 && <p className="mt-6 text-sm text-zinc-500">{data.days.length === 0 ? "The first Daily is today. Come back tomorrow." : "Nothing here yet."}</p>}

      <ol className="mt-4">
        {visible.map((d, i) => {
          const p = data.played[d];
          const newMonth = i === 0 || monthLabel(visible[i - 1]) !== monthLabel(d);
          const isOpen = open === d;
          return (
            <li key={d} id={`day-${d}`} className="scroll-mt-24">
              {newMonth && <h2 className="mt-5 mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">{monthLabel(d)}</h2>}
              <div className={cn("mb-2 rounded-xl border bg-zinc-900 px-4 py-3", isOpen ? "border-zinc-600" : "border-zinc-800")}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-100">{rowLabel(d)}</div>
                    <div className="mt-1"><Status p={p} /></div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setOpen(isOpen ? null : d)} aria-expanded={isOpen} aria-controls={`five-${d}`}
                      className="min-h-11 rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100">
                      Perfect five {isOpen ? "▴" : "▾"}
                    </button>
                    <ButtonLink href={`/play?mode=daily&date=${d}`} variant={p ? "secondary" : "primary"} size="sm" className="min-h-11 px-4"
                      aria-label={`${p ? "Replay" : "Play"} the Daily for ${rowLabel(d)}`}>
                      {p ? "Replay" : "Play"}
                    </ButtonLink>
                  </div>
                </div>
                {isOpen && (
                  <div id={`five-${d}`}>
                    {!p && <p className="mt-3 text-xs text-zinc-500">Spoiler: this is the best five from that day&apos;s spins. Play it first if you want a clean shot.</p>}
                    <CeilingReveal date={d} yourWins={bestWins(p)} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {shown.length > limit && (
        <button onClick={() => setLimit((n) => n + 60)} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-800 text-sm font-semibold text-zinc-300 transition hover:border-zinc-600">
          Show older days
        </button>
      )}
    </div>
  );
}
