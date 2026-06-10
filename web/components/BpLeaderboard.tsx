"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import type { DraftStep } from "@/lib/types";
import { BLUEPRINTS, blueprintDef, type BlueprintKey, type BpBoardView, type BpBoardRow } from "@/lib/blueprint";
import { getUid, getName, setName as persistName } from "@/lib/streak";

// Blueprint daily board — FhLeaderboard's slim shape (no streak, no weekly/all-time, no sign-in
// claim: bp scores carry a cosmetic execution multiplier and stay out of the aggregates). The
// COMBINED board is the primary tab (five stratified boards would feel empty at current player
// counts — the spec's own flagged risk); per-blueprint chips filter down to one objective.

const serverDate = () => { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };
type BoardTab = BlueprintKey | "all";
// grade colors: DESIGN.md single-source rule (mirrors ResultCard/ResultsHistory/og GRADE maps)
const gradeText = (g: string) =>
  g === "S" || g === "A+" ? "text-gold" : g.startsWith("A") ? "text-green-400" : g.startsWith("B") ? "text-blue-400"
  : g.startsWith("C") ? "text-amber-400" : g.startsWith("D") ? "text-slate-400" : "text-red-400";

export default function BpLeaderboard({ date, trace, blueprint, usedHints = false, readOnly = false }: {
  date: string; trace: DraftStep[]; blueprint: BlueprintKey; usedHints?: boolean; readOnly?: boolean;
}) {
  const [tab, setTab] = useState<BoardTab>("all");
  const [views, setViews] = useState<Partial<Record<BoardTab, BpBoardView>>>({});
  const [enabled, setEnabled] = useState(true);
  const [uid, setUid] = useState("");
  const [name, setNameState] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const stale = !readOnly && date !== serverDate();

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      const id = getUid();
      setUid(id); setNameState(getName());
      try {
        const r = await fetch(`/api/blueprint/leaderboard?date=${encodeURIComponent(date)}&bp=${tab}&uid=${encodeURIComponent(id)}`, { signal: ctl.signal });
        if (r.status === 503) { setEnabled(false); return; }
        if (r.ok) {
          const v = await r.json();
          setViews((prev) => ({ ...prev, [tab]: v }));
          // "have I already posted this seed?" is answered by the combined board (every submit lands there)
          if (tab === "all") setSubmitted((s) => s || !!v?.you);
        }
      } catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; /* offline — board hidden */ }
    })();
    return () => ctl.abort();
  }, [date, tab, reload]);

  const submit = useCallback(async () => {
    if (date !== serverDate()) { setErr("Today's blueprint just reset — start today's game to post a score."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/blueprint/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, uid, name: name.trim(), trace, blueprint, usedHints }),
      });
      if (r.status === 503) { setEnabled(false); return; }
      const v = await r.json();
      if (!r.ok) { setErr(v?.error === "stale date" ? "Today's blueprint just reset — start today's game to post a score." : v?.error ?? "submit failed"); return; }
      if (name.trim()) persistName(name.trim());
      // the response is your own blueprint's board — land the player on the board they competed on
      setViews((prev) => ({ ...prev, [blueprint]: v }));
      setTab(blueprint); setSubmitted(true); setReload((n) => n + 1);
      track("bp_submit", { blueprint, rank: v?.you?.rank ?? 0 });
    } catch { setErr("network error"); } finally { setBusy(false); }
  }, [date, uid, name, trace, blueprint, usedHints]);

  const view = views[tab] ?? null;
  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-zinc-200">📐 Blueprint — today&apos;s board</div>
        <div className="text-xs text-zinc-500">wins × execution</div>
      </div>
      {enabled ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-zinc-950/60 p-1 text-xs font-semibold">
            <Chip active={tab === "all"} onClick={() => setTab("all")} label="🏆 All" title="Best blueprint-adjusted score across every objective" />
            {BLUEPRINTS.map((b) => (
              <Chip key={b.key} active={tab === b.key} onClick={() => setTab(b.key)} label={`${b.emoji} ${b.label.split(" ")[0]}`} title={b.label} />
            ))}
          </div>

          {stale && !submitted && (
            <div className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              Today&apos;s blueprint just reset — this game was for an earlier day, so it can&apos;t be posted.
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
        <div className="mt-2 text-xs text-zinc-600">Board opens soon — your execution grade still counts for bragging rights.</div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} aria-pressed={active}
      className={`rounded-md px-2 py-1.5 ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>{label}</button>
  );
}

function Board({ view, uid }: { view: BpBoardView; uid: string }) {
  const rows = view.top;
  const youOutside = view.you && !rows.some((r) => r.uid === uid);
  if (!rows.length) return (
    <div className="mt-3 text-xs text-zinc-500">
      {view.bp === "all" ? "Be the first to post a score today." : `No one has gone ${blueprintDef(view.bp as BlueprintKey).label} yet — claim it.`}
    </div>
  );
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>Today&apos;s top {Math.min(rows.length, 100)}</span><span>{view.total} {view.bp === "all" ? "played" : "on this blueprint"}</span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {rows.map((r) => <Row key={r.uid} r={r} me={r.uid === uid} showBp={view.bp === "all"} />)}
        {youOutside && view.you && <Row r={view.you} me showBp={view.bp === "all"} />}
      </div>
    </div>
  );
}

function Row({ r, me, showBp }: { r: BpBoardRow; me?: boolean; showBp: boolean }) {
  // an "h~" can only be a flag prefix (player ids are [a-z0-9_]) — hint transparency on the board
  const hinted = r.lineup.includes("h~");
  return (
    <Link href={`/r/${r.lineup}`}
      className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${me ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "bg-zinc-950/50 hover:bg-zinc-800/60"}`}>
      <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">
        {r.name}{me && <span className="ml-1 text-[10px] text-orange-300">you</span>}
        {showBp && <span className="ml-1.5 text-[10px]" title={blueprintDef(r.bp).label}>{blueprintDef(r.bp).emoji}</span>}
        {hinted && <span className="ml-1 text-[10px]" title="Drafted with hints">💡</span>}
      </span>
      <span className="shrink-0 tabular-nums font-bold text-zinc-100">
        {r.score % 1 === 0 ? r.score : r.score.toFixed(1)}
        <span className={`ml-1 text-[10px] font-semibold ${gradeText(r.grade)}`}>{r.grade}</span>
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">{r.wins}-{r.losses}</span>
    </Link>
  );
}
