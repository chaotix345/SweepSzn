"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BADGES, type BadgeKey, type DexPlayer } from "@/lib/dex";
import { eraLabel } from "@/lib/teams";
import { TRAIT_META } from "@/lib/traits";
import { encodeDexShare } from "@/lib/share";

// The Drafted Dex collection screen. Fetches /api/dex (auth-gated), then renders a completion
// counter, the milestone shelf, filters, and the player-card grid — all descriptive (DESIGN.md §12).

interface DexData { players: DexPlayer[]; total: number; badges: BadgeKey[] }
const TOTAL_PEOPLE = 2304; // unique real people in the draftable dataset

const Empty = ({ msg }: { msg: string }) => (
  <div className="py-16 text-center">
    <h1 className="font-display text-3xl">Drafted Dex</h1>
    <p className="mt-2 text-zinc-400">{msg}</p>
    <Link href="/play" className="mt-5 inline-block rounded-xl bg-orange-500 px-5 py-2.5 font-bold text-black hover:bg-orange-400">Play a round →</Link>
  </div>
);

export function DexBoard() {
  const [data, setData] = useState<DexData | null>(null);
  const [phase, setPhase] = useState<"loading" | "signedOut" | "error" | "ok">("loading");
  const [decade, setDecade] = useState("All");
  const [pos, setPos] = useState("All");
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    let alive = true;
    fetch("/api/dex").then(async (r) => {
      if (r.status === 401) { if (alive) setPhase("signedOut"); return; }
      if (!r.ok) { if (alive) setPhase("error"); return; }
      const d: DexData = await r.json();
      if (alive) { setData(d); setPhase("ok"); }
    }).catch(() => { if (alive) setPhase("error"); });
    return () => { alive = false; };
  }, []);

  const decades = useMemo(() => (data ? [...new Set(data.players.map((p) => p.decade))].sort() : []), [data]);
  const filtered = useMemo(() => (data?.players ?? []).filter((p) =>
    (decade === "All" || p.decade === decade) && (pos === "All" || p.eligible.includes(pos))), [data, decade, pos]);
  const people = useMemo(() => (data ? new Set(data.players.map((p) => p.personId)).size : 0), [data]);

  if (phase === "loading") return <p className="py-16 text-center text-sm text-zinc-500">Loading your Dex…</p>;
  if (phase === "error") return <p className="py-16 text-center text-sm text-zinc-500">Couldn&apos;t load your Dex. Try again.</p>;
  if (phase === "signedOut") return <Empty msg="Sign in (by playing) to save every player you've drafted across devices." />;
  if (!data) return null;
  if (!data.players.length) return <Empty msg="You haven't drafted anyone yet." />;

  const earned = new Set(data.badges);
  // Share the collection: top players by fame (descriptive) + the collection/badge counts → /dex/s card.
  const shareDex = async () => {
    const topIds = [...data.players].sort((a, b) => b.fame - a.fame).slice(0, 10).map((p) => p.id);
    const card = encodeDexShare(topIds, data.players.length, data.badges.length);
    const url = `${window.location.origin}/dex/s/${card}`;
    const text = `My Drafted Dex: ${data.players.length} all-time players collected on SweepSzn. Build your own → via @SweepSeason`;
    try { if (navigator.share) { await navigator.share({ title: "My Drafted Dex", text, url }); return; } } catch { /* dismissed */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setShareState("copied"); setTimeout(() => setShareState("idle"), 1800); } catch { /* ignore */ }
  };
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl leading-none">Drafted Dex</h1>
          <p className="mt-1 text-sm text-zinc-500">{data.players.length} cards · {data.total} recent games</p>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl leading-none text-orange-400">{people}</div>
          <div className="text-xs text-zinc-500">of {TOTAL_PEOPLE.toLocaleString()} players</div>
        </div>
      </div>
      <button onClick={shareDex} aria-label="Share your Dex"
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:border-orange-500 hover:text-orange-300">
        {shareState === "copied" ? "Link copied ✓" : "📤 Share your Dex"}
      </button>

      <div className="mt-6">
        <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">Milestones · {earned.size}/{BADGES.length}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {BADGES.map((b) => {
            const got = earned.has(b.key);
            return (
              <span key={b.key} title={got ? b.hint : "Locked — keep drafting to discover"}
                className={`rounded-lg border px-2.5 py-1 text-xs ${got ? "border-orange-500/50 bg-orange-500/10 text-orange-300" : "border-zinc-800 bg-zinc-900/40 text-zinc-600"}`}>
                {got ? "★ " : "▦ "}{b.name}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
        <select value={decade} onChange={(e) => setDecade(e.target.value)} aria-label="Filter by decade"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-300">
          <option value="All">All decades</option>
          {decades.map((d) => <option key={d} value={d}>{eraLabel(d)}</option>)}
        </select>
        <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Filter by position"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-300">
          {["All", "PG", "SG", "SF", "PF", "C"].map((p) => <option key={p} value={p}>{p === "All" ? "All positions" : p}</option>)}
        </select>
        <span className="text-zinc-500">{filtered.length} shown</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="truncate text-sm font-bold">{p.name}</div>
            <div className="truncate text-[11px] text-zinc-500">{p.team} · {eraLabel(p.decade)} · {p.eligible.join("/")}</div>
            <div className="mt-1 font-mono text-xs text-zinc-400">{(p.pts ?? 0).toFixed(1)} · {(p.trb ?? 0).toFixed(1)} · {(p.ast ?? 0).toFixed(1)}</div>
            {p.traits.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.traits.slice(0, 2).map((t) => (
                  <span key={t} className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">{TRAIT_META[t].icon} {TRAIT_META[t].label}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
