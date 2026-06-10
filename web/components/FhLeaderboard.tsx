"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import type { DraftStep } from "@/lib/types";
import type { FhBoardView, FhBoardRow } from "@/lib/factorHunt";
import { getUid, getName, setName as persistName } from "@/lib/streak";
import { dayUTC } from "@/lib/day";

// Factor Hunt daily board — deliberately slimmer than the Daily Leaderboard: no streak, no
// weekly/all-time tabs, no sign-in claim (FH scores carry a cosmetic ×1.05 and stay out of the
// aggregate boards). Rank = wins × bonus; a 🔮 marks a correct prediction.

const serverDate = dayUTC;

export default function FhLeaderboard({ date, trace, prediction, readOnly = false }: {
  date: string; trace: DraftStep[]; prediction: string | null; readOnly?: boolean;
}) {
  const [view, setView] = useState<FhBoardView | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [uid, setUid] = useState("");
  const [name, setNameState] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stale = !readOnly && date !== serverDate();

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      const id = getUid();
      setUid(id); setNameState(getName());
      try {
        const r = await fetch(`/api/factorhunt/leaderboard?date=${encodeURIComponent(date)}&uid=${encodeURIComponent(id)}`, { signal: ctl.signal });
        if (r.status === 503) { setEnabled(false); return; }
        if (r.ok) { const v = await r.json(); setView(v); setSubmitted(!!v?.you); }
      } catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; /* offline — board hidden */ }
    })();
    return () => ctl.abort();
  }, [date]);

  const submit = useCallback(async () => {
    if (date !== serverDate()) { setErr("Today's hunt just reset — start today's game to post a score."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/factorhunt/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, uid, name: name.trim(), trace, prediction }),
      });
      if (r.status === 503) { setEnabled(false); return; }
      const v = await r.json();
      if (!r.ok) { setErr(v?.error === "stale date" ? "Today's hunt just reset — start today's game to post a score." : v?.error ?? "submit failed"); return; }
      if (name.trim()) persistName(name.trim());
      setView(v); setSubmitted(true);
      track("fh_submit", { rank: v?.you?.rank ?? 0, correct: !!v?.you?.correct });
    } catch { setErr("network error"); } finally { setBusy(false); }
  }, [date, uid, name, trace, prediction]);

  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-zinc-200">🔮 Factor Hunt — today&apos;s board</div>
        <div className="text-xs text-zinc-500">wins × bonus</div>
      </div>
      {enabled ? (
        <>
          {stale && !submitted && (
            <div className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              Today&apos;s hunt just reset — this game was for an earlier day, so it can&apos;t be posted.
            </div>
          )}
          {!submitted && !readOnly && !stale && trace.length === 5 && (
            <div className="mt-3 flex gap-2">
              <input value={name} onChange={(e) => setNameState(e.target.value)} maxLength={24} placeholder="Your name"
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-orange-500" />
              <button onClick={submit} disabled={busy}
                className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60">
                {busy ? "…" : "🏆 Submit"}
              </button>
            </div>
          )}
          {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
          {view && <Board view={view} uid={uid} />}
        </>
      ) : (
        <div className="mt-2 text-xs text-zinc-600">Board opens soon — your prediction still counts for bragging rights.</div>
      )}
    </div>
  );
}

function Board({ view, uid }: { view: FhBoardView; uid: string }) {
  const rows = view.top;
  const youOutside = view.you && !rows.some((r) => r.uid === uid);
  if (!rows.length) return <div className="mt-3 text-xs text-zinc-500">Be the first to post a score today.</div>;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>Today&apos;s top {Math.min(rows.length, 100)}</span><span>{view.total} played</span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {rows.map((r) => <Row key={r.uid} r={r} me={r.uid === uid} />)}
        {youOutside && view.you && <Row r={view.you} me />}
      </div>
    </div>
  );
}

function Row({ r, me }: { r: FhBoardRow; me?: boolean }) {
  return (
    <Link href={`/r/${r.lineup}`}
      className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${me ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "bg-zinc-950/50 hover:bg-zinc-800/60"}`}>
      <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">
        {r.name}{me && <span className="ml-1 text-[10px] text-orange-300">you</span>}
        {r.correct && <span className="ml-1.5 text-[10px]" title={`Called it: ${r.predicted}`}>🔮</span>}
      </span>
      <span className="shrink-0 tabular-nums font-bold text-zinc-100">
        {r.score % 1 === 0 ? r.score : r.score.toFixed(1)}
        {r.correct && <span className="ml-1 text-[10px] font-semibold text-violet-300">×1.05</span>}
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">{r.wins}-{r.losses}</span>
    </Link>
  );
}
