"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SurgeonBoardView, SurgeonBoardRow } from "@/lib/surgeon";
import { getUid } from "@/lib/streak";
import { useSessionContext } from "@/components/SessionProvider";

// Surgeon daily board — slimmest of the boards: the submit happens at swap-confirm time (the
// reveal IS the submit, so the row already exists by the time this renders). This component
// only reads: preloaded from the submit response when available, fetched for restores.
// Rank = win delta; a surgical +8 on a broken five beats a lazy +2 on an elite one.

export default function SgLeaderboard({ date, preloaded }: { date: string; preloaded?: SurgeonBoardView | null }) {
  const { user } = useSessionContext();
  const [view, setView] = useState<SurgeonBoardView | null>(preloaded ?? null);
  const [enabled, setEnabled] = useState(true);
  const [uid, setUid] = useState("");

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      const id = user?.uid ?? getUid(); // signed in: "you" highlight keys off the account
      setUid(id);
      if (preloaded) return; // submit response already carried the fresh board
      try {
        const r = await fetch(`/api/surgeon/leaderboard?date=${encodeURIComponent(date)}&uid=${encodeURIComponent(id)}`, { signal: ctl.signal });
        if (r.status === 503) { setEnabled(false); return; }
        if (r.ok) setView(await r.json());
      } catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; /* offline — board hidden */ }
    })();
    return () => ctl.abort();
  }, [date, preloaded, user?.uid]);

  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-zinc-200">🩺 Surgeon — today&apos;s board</div>
        <div className="text-xs text-zinc-500">ranked by win delta</div>
      </div>
      {enabled ? (
        view && view.top.length ? <Board view={view} uid={uid} /> :
        <div className="mt-3 text-xs text-zinc-500">Be the first to post a fix today.</div>
      ) : (
        <div className="mt-2 text-xs text-zinc-600">Board opens soon — your delta still counts for bragging rights.</div>
      )}
    </div>
  );
}

function Board({ view, uid }: { view: SurgeonBoardView; uid: string }) {
  const rows = view.top;
  const youOutside = view.you && !rows.some((r) => r.uid === uid);
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>Today&apos;s top {Math.min(rows.length, 100)}</span><span>{view.total} operated</span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {rows.map((r) => <Row key={r.uid} r={r} me={r.uid === uid} />)}
        {youOutside && view.you && <Row r={view.you} me />}
      </div>
    </div>
  );
}

function Row({ r, me }: { r: SurgeonBoardRow; me?: boolean }) {
  return (
    <Link href={`/sg/${r.card}`}
      className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${me ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "bg-zinc-950/50 hover:bg-zinc-800/60"}`}>
      <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">
        {r.name}{me && <span className="ml-1 text-[10px] text-orange-300">you</span>}
      </span>
      <span className={`shrink-0 tabular-nums font-bold ${r.delta > 0 ? "text-green-400" : r.delta < 0 ? "text-red-400" : "text-zinc-300"}`}>
        {r.delta > 0 ? "+" : ""}{r.delta}
      </span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-500">{r.beforeWins}→{r.afterWins}</span>
    </Link>
  );
}
