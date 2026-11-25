"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { dayUTC } from "@/lib/day";

// /leaderboards secondary boards (W1): today's Factor Hunt, Blueprint (combined view only) and Surgeon
// boards, each shown only once it has entries. Reads the public CDN-cached GETs; rows carry no links
// (a lineup is that mode's answer key while its day is live). Renders nothing when all are empty.
type Row = { rank: number; name: string; score: string };
type Board = { key: string; label: string; chip: string; href: string; total: number; rows: Row[] };

type Raw = { total?: number; top?: Record<string, unknown>[] };
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

const BOARDS: { key: string; label: string; chip: string; href: string; url: (d: string) => string; score: (r: Record<string, unknown>) => string }[] = [
  { key: "factorhunt", label: "Factor Hunt", chip: "bg-violet-500/15 text-violet-400", href: "/play?mode=factorhunt",
    url: (d) => `/api/factorhunt/leaderboard?date=${d}`, score: (r) => `${num(r.wins)}-${num(r.losses)}` },
  { key: "blueprint", label: "Blueprint", chip: "bg-cyan-500/15 text-cyan-400", href: "/play?mode=blueprint",
    url: (d) => `/api/blueprint/leaderboard?date=${d}&bp=all`, score: (r) => `${fmt(num(r.score))} pts` },
  { key: "surgeon", label: "Surgeon", chip: "bg-rose-500/15 text-rose-400", href: "/play?mode=surgeon",
    url: (d) => `/api/surgeon/leaderboard?date=${d}`, score: (r) => `${num(r.delta) >= 0 ? "+" : ""}${fmt(num(r.delta))} wins` },
];

export default function SecondaryBoards() {
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    let alive = true;
    const date = dayUTC();
    (async () => {
      const got = await Promise.all(BOARDS.map(async (b) => {
        try {
          const r = await fetch(b.url(date));
          if (!r.ok) return null;
          const v = (await r.json()) as Raw;
          const top = Array.isArray(v?.top) ? v.top : [];
          if (!top.length) return null;
          return { key: b.key, label: b.label, chip: b.chip, href: b.href, total: num(v.total),
            rows: top.slice(0, 5).map((row) => ({ rank: num(row.rank), name: String(row.name ?? ""), score: b.score(row) })) };
        } catch { return null; }
      }));
      if (alive) setBoards(got.filter((b): b is Board => !!b));
    })();
    return () => { alive = false; };
  }, []);

  if (!boards.length) return null;
  return (
    <div className="mt-10">
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Other boards today</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {boards.map((b) => (
          <div key={b.key} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${b.chip}`}>{b.label}</span>
              <span className="text-[11px] text-zinc-500">{b.total} played</span>
            </div>
            <ol className="mt-3 space-y-1">
              {b.rows.map((r) => (
                <li key={r.rank} className="flex items-center gap-3 rounded-lg bg-zinc-950/50 px-2.5 py-1.5 text-sm">
                  <span className={`w-5 shrink-0 text-right text-xs font-bold tabular-nums ${r.rank === 1 ? "text-gold" : "text-zinc-500"}`}>{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{r.name}</span>
                  <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-zinc-300">{r.score}</span>
                </li>
              ))}
            </ol>
            <Link href={b.href} className="mt-3 inline-block text-sm font-bold text-orange-400 hover:text-orange-300">Play {b.label} →</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
