"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import type { DraftStep, LeaderboardView, LeaderboardRow, AggBoardView, AggLeaderboardRow } from "@/lib/types";
import { getUid, getName, setName as persistName, recordDailyDone, getStreak, msToNextUtcMidnight } from "@/lib/streak";
import { useSession } from "@/lib/useSession";
import GoogleOneTap from "@/components/GoogleOneTap";

type Tab = "daily" | "week" | "alltime";
const TABS: [Tab, string][] = [["daily", "Daily"], ["week", "Weekly"], ["alltime", "All-time"]];

const hhmmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

export default function Leaderboard({ date, trace }: { date: string; trace: DraftStep[] }) {
  const { user, refresh, signOut } = useSession();
  const [tab, setTab] = useState<Tab>("daily");
  const [view, setView] = useState<LeaderboardView | null>(null);
  const [agg, setAgg] = useState<Partial<Record<Tab, AggBoardView | null>>>({});
  const [enabled, setEnabled] = useState(true);
  const [anonUid, setAnonUid] = useState("");
  const [name, setNameState] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [countdown, setCountdown] = useState(() => msToNextUtcMidnight());
  const [reload, setReload] = useState(0);

  const effectiveUid = user?.uid ?? anonUid; // who "you" is on the board

  const loadBoard = useCallback(async (uid: string) => {
    try {
      const r = await fetch(`/api/daily/leaderboard?date=${encodeURIComponent(date)}&uid=${encodeURIComponent(uid)}`);
      if (r.status === 503) { setEnabled(false); return; }
      if (r.ok) { const v = await r.json(); setView(v); setSubmitted(!!v?.you); }
    } catch { /* offline — leave board hidden */ }
  }, [date]);

  useEffect(() => {
    (async () => {
      const id = getUid();
      setAnonUid(id);
      setNameState(getName());
      recordDailyDone(date);
      setStreak(getStreak());
      await loadBoard(user?.uid ?? id);
    })();
  }, [date, user?.uid, loadBoard]);

  // lazy-load the weekly / all-time board when its tab is active (and after a submit/sign-in)
  useEffect(() => {
    if (tab === "daily" || !enabled || !effectiveUid) return;
    const path = tab === "week" ? "/api/board/weekly" : "/api/board/alltime";
    const ctl = new AbortController();
    (async () => {
      try {
        const r = await fetch(`${path}?uid=${encodeURIComponent(effectiveUid)}`, { signal: ctl.signal });
        if (r.status === 503) { setEnabled(false); return; }
        if (r.ok) { const v = await r.json(); setAgg((a) => ({ ...a, [tab]: v })); }
      } catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; /* offline */ }
    })();
    return () => ctl.abort();
  }, [tab, effectiveUid, enabled, reload]);

  useEffect(() => {
    const t = setInterval(() => setCountdown(msToNextUtcMidnight()), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/daily/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, uid: anonUid, name: name.trim(), trace }),
      });
      if (r.status === 503) { setEnabled(false); return; }
      const v = await r.json();
      if (!r.ok) { setErr(v?.error ?? "submit failed"); return; }
      if (name.trim()) persistName(name.trim());
      setView(v); setSubmitted(true); setReload((n) => n + 1);
      track("daily_submit", { rank: v?.you?.rank ?? 0, authed: !!user });
    } catch { setErr("network error"); } finally { setBusy(false); }
  }, [date, anonUid, name, trace, user]);

  // On sign-in: refresh session, then auto-claim today's result under the Google identity
  // (which also credits the weekly + all-time boards).
  const onSignIn = useCallback(async () => {
    await refresh();
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/daily/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, name: name.trim(), trace }),
      });
      if (r.status === 503) { setEnabled(false); return; }
      const v = await r.json();
      if (r.ok) { setView(v); setSubmitted(true); setReload((n) => n + 1); track("daily_claim", { rank: v?.you?.rank ?? 0 }); }
    } catch { /* ignore */ } finally { setBusy(false); }
  }, [refresh, date, name, trace]);

  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-zinc-200">🏆 Leaderboard</div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {streak > 0 && <span className="rounded bg-orange-500/15 px-2 py-0.5 font-semibold text-orange-300">🔥 {streak}-day streak</span>}
          {tab === "daily" && <span>next in <span className="tabular-nums text-zinc-400">{hhmmss(countdown)}</span></span>}
        </div>
      </div>

      {enabled ? (
        <>
          <div className="mt-3 flex gap-1 rounded-lg bg-zinc-950/60 p-1 text-xs font-semibold">
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 rounded-md py-1.5 ${tab === k ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>{label}</button>
            ))}
          </div>

          {tab === "daily" && !submitted && (
            <div className="mt-3 flex gap-2">
              <input value={name} onChange={(e) => setNameState(e.target.value)} maxLength={24} placeholder={user ? user.name : "Your name"}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-orange-500" />
              <button onClick={submit} disabled={busy}
                className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60">
                {busy ? "…" : "🏆 Submit"}
              </button>
            </div>
          )}

          {/* Identity: signed-in badge, or a sign-in prompt (claims today + joins weekly/all-time) */}
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
            user ? (
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>Signed in{user.name ? ` as ${user.name}` : ""} · ranks are yours to keep</span>
                <button onClick={signOut} className="text-zinc-400 underline hover:text-zinc-200">Sign out</button>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-2 text-xs text-zinc-400">
                  {tab === "daily" ? "Sign in to claim your rank — and join the weekly & all-time boards." : "Sign in and play to climb the weekly & all-time boards."}
                </div>
                <GoogleOneTap onSignIn={onSignIn} />
              </div>
            )
          )}

          {err && <div className="mt-2 text-xs text-red-400">{err}</div>}

          {tab === "daily" && view && <Board view={view} uid={effectiveUid} />}
          {tab !== "daily" && <AggBoard view={agg[tab] ?? null} uid={effectiveUid} scope={tab} />}
        </>
      ) : (
        <div className="mt-2 text-xs text-zinc-600">Leaderboard opens soon — keep your streak going.</div>
      )}
    </div>
  );
}

function Board({ view, uid }: { view: LeaderboardView; uid: string }) {
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

function Row({ r, me }: { r: LeaderboardRow; me?: boolean }) {
  return (
    <Link href={`/r/${r.lineup}`}
      className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${me ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "bg-zinc-950/50 hover:bg-zinc-800/60"}`}>
      <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{r.name}{me && <span className="ml-1 text-[10px] text-orange-300">you</span>}</span>
      <span className="shrink-0 tabular-nums font-bold text-zinc-100">{r.wins}-{r.losses}</span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">{r.net > 0 ? "+" : ""}{r.net.toFixed(1)}</span>
    </Link>
  );
}

function AggBoard({ view, uid, scope }: { view: AggBoardView | null; uid: string; scope: "week" | "alltime" }) {
  if (!view) return <div className="mt-3 text-xs text-zinc-500">Loading…</div>;
  const rows = view.top;
  const youOutside = view.you && !rows.some((r) => r.uid === uid);
  if (!rows.length) return <div className="mt-3 text-xs text-zinc-500">No one&apos;s on this board yet — sign in and play to start the climb.</div>;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>{scope === "week" ? "This week" : "All-time"} · top {Math.min(rows.length, 100)}</span><span>{view.total} players</span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {rows.map((r) => <AggRowView key={r.uid} r={r} me={r.uid === uid} />)}
        {youOutside && view.you && <AggRowView r={view.you} me />}
      </div>
    </div>
  );
}

function AggRowView({ r, me }: { r: AggLeaderboardRow; me?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${me ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "bg-zinc-950/50"}`}>
      <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{r.name}{me && <span className="ml-1 text-[10px] text-orange-300">you</span>}</span>
      <span className="shrink-0 tabular-nums font-bold text-zinc-100">{r.wins.toLocaleString()}<span className="ml-1 text-xs font-normal text-zinc-500">wins</span></span>
    </div>
  );
}
