"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import type { DraftStep, LineupResult, Player, ChallengeSubmitResponse, ChallengeMiniPlayer, ChallengeBoard, ChallengeBoardRow } from "@/lib/types";
import { getUid, getName, setName as persistName } from "@/lib/streak";
import { SLOTS, teamColors, initials, eraLabel, displayName } from "@/lib/teams";

export default function ChallengeResult({ id, role, result, players, trace, seed, usedHints, onCreateOwn }: {
  id: string; role: "create" | "respond"; result: LineupResult; players: Player[]; trace: DraftStep[];
  seed: string; usedHints?: boolean; onCreateOwn?: () => void;
}) {
  const [resp, setResp] = useState<ChallengeSubmitResponse | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);
  const submittingRef = useRef(false); // synchronous in-flight guard (survives StrictMode double-invoke)

  const link = typeof window !== "undefined" ? new URL(`/c/${id}`, window.location.origin).toString() : `/c/${id}`;

  const submit = useCallback(async (nm: string) => {
    if (resp || submittingRef.current) return; // never double-submit (StrictMode, rapid taps)
    submittingRef.current = true;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/challenge/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        // `seed` + `usedHints` are honored only when this submit CREATES the challenge — they carry the
        // finished game's draft so a friend faces the same teams/eras and beats this exact record.
        body: JSON.stringify({ id, uid: getUid(), name: nm.trim(), trace, seed, usedHints: !!usedHints }),
      });
      if (r.status === 503) { setEnabled(false); return; }
      const v = await r.json();
      if (!r.ok) { setErr(v?.error ?? "submit failed"); return; }
      persistName(nm.trim());
      setResp(v as ChallengeSubmitResponse);
      track("challenge_submit", { role: (v as ChallengeSubmitResponse)?.role ?? role });
    } catch { setErr("network error"); } finally { setBusy(false); submittingRef.current = false; }
  }, [id, trace, role, seed, usedHints, resp]);

  // Pre-fill the player's known name. We deliberately do NOT auto-submit: the responder must click
  // "Reveal" (consent before the matchup is shown + recorded), and the creator's name must be captured
  // before the write-once bar is set. Returning players just press the button once. (async IIFE keeps
  // the setState out of the effect body for react-hooks/set-state-in-effect — the repo's idiom.)
  useEffect(() => { (async () => { setName(getName()); })(); }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true); track("share", { target: "challenge_copy" }); ev("share", { uid: getUid() }); setTimeout(() => setCopied(false), 1500);
    } catch { setCopyErr(true); setTimeout(() => setCopyErr(false), 2500); }
  }, [link]);

  if (!enabled) {
    return <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">Challenges need server configuration — your five is still scored above.</div>;
  }

  // name gate (shown until a verified submit returns)
  if (!resp) {
    return (
      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="text-sm font-bold text-zinc-200">⚔️ {role === "respond" ? "Reveal the matchup" : "Challenge a friend to beat this five"}</div>
        {role === "create" && (
          <p className="mt-1 text-xs text-zinc-400">They draft the <strong className="text-zinc-300">same teams and eras</strong> you just did and try to beat your {result.wins}-{result.losses}. Create the link to share it.</p>
        )}
        <div className="mt-3 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Your name"
            aria-label="Your name"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-orange-500" />
          <button onClick={() => submit(name)} disabled={busy}
            className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60">
            {busy ? "…" : role === "respond" ? "🏆 Reveal" : "🔗 Create link"}
          </button>
        </div>
        {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
      </div>
    );
  }

  if (resp.role === "creator") {
    return (
      <div className="mt-4 rounded-2xl border border-orange-500/40 bg-zinc-900 p-5">
        <div className="text-center">
          <div className="text-sm font-black uppercase tracking-widest text-orange-400">Challenge created</div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
            Send this link. The first friend to beat your <b className="text-zinc-200">{result.wins}-{result.losses}</b> from the same draft wins.
            {usedHints && <span className="text-zinc-500"> (you drafted with hints)</span>}
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <input readOnly value={link} aria-label="Challenge link" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none" />
          <button onClick={copy} className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400">
            {copied ? "Copied!" : copyErr ? "Copy failed" : "Copy link"}
          </button>
        </div>
        <Board board={resp.board} />
      </div>
    );
  }

  // responder
  const v = resp.verdict;
  const tone = v.outcome === "win" ? "text-green-400" : v.outcome === "loss" ? "text-red-400" : "text-amber-400";
  const banner = v.outcome === "win" ? "You win! 🏆" : v.outcome === "loss" ? "You lost" : "Dead heat";
  const yourFive: ChallengeMiniPlayer[] = players.map((p, i) => ({ id: p.id, name: p.name, team: p.team, decade: p.decade, slot: SLOTS[i] }));
  // Margin line: a net-rating tiebreak has winsMargin 0, so don't render the nonsensical "by 0 wins".
  const margin = v.outcome === "tie"
    ? "same record and net rating"
    : v.winsMargin === 0
      ? `same record — decided on Net ${v.netMargin > 0 ? "+" : ""}${v.netMargin.toFixed(1)}`
      : `by ${Math.abs(v.winsMargin)} win${Math.abs(v.winsMargin) === 1 ? "" : "s"} · Net ${v.netMargin > 0 ? "+" : ""}${v.netMargin.toFixed(1)}`;
  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="text-center">
        <div className={`text-2xl font-black ${tone}`}>{banner}</div>
        <div className="mt-2 flex items-center justify-center gap-4 text-sm">
          <span className="font-bold text-zinc-100">You {result.wins}-{result.losses}</span>
          <span className="text-zinc-600">vs</span>
          <span className="font-bold text-zinc-300">{resp.creator.name} {resp.creator.wins}-{resp.creator.losses}{resp.creator.hinted && <span className="ml-1 text-[10px] font-normal text-zinc-500">(hints)</span>}</span>
        </div>
        <div className="mt-1 text-xs text-zinc-500">{margin}</div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <FiveStrip title="Your five" five={yourFive} />
        <FiveStrip title={`${resp.creator.name}'s five`} five={resp.creator.players} href={resp.creator.creatorResultUrl} />
      </div>

      <Board board={resp.board} />

      <div className="mt-4 flex gap-2">
        <button onClick={copy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold hover:border-zinc-500">
          {copied ? "Copied!" : copyErr ? "Copy failed" : "Share this challenge"}
        </button>
        <button onClick={onCreateOwn} className="flex-1 rounded-xl bg-orange-500 py-2.5 text-center text-sm font-bold text-black hover:bg-orange-400">
          ⚔️ Create your own
        </button>
      </div>
    </div>
  );
}

function FiveStrip({ title, five, href }: { title: string; five: ChallengeMiniPlayer[]; href?: string }) {
  const body = (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>{title}</span>{href && <span className="text-orange-400/80">view →</span>}
      </div>
      <div className="flex justify-between gap-1">
        {five.map((p) => {
          const c = teamColors(p.team);
          return (
            <div key={p.id} className="flex min-w-0 flex-col items-center">
              <div className="flex h-9 w-9 flex-col items-center justify-center rounded-lg text-[10px] font-black leading-none"
                style={{ background: c.bg, color: c.text }}>
                <span>{initials(p.name)}</span><span className="mt-0.5 text-[7px] opacity-80">{p.slot}</span>
              </div>
              <span className="mt-1 w-full truncate text-center text-[9px] text-zinc-400">{displayName(p.name)}</span>
              <span className="text-[8px] text-zinc-500">{p.team} · {eraLabel(p.decade)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Board({ board }: { board: ChallengeBoard }) {
  const rows = board.top;
  if (!rows.length) return null;
  // rows carry no uid (never exposed); "you" is the server-identified board.you, matched by rank.
  const youRank = board.you?.rank;
  const youOutside = board.you && !rows.some((r) => r.rank === youRank);
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>Challenge board</span><span>{board.total} played</span>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {rows.map((r) => <Row key={r.rank} r={r} me={r.rank === youRank} />)}
        {youOutside && board.you && <Row r={board.you} me />}
      </div>
    </div>
  );
}

function Row({ r, me }: { r: ChallengeBoardRow; me?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${me ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "bg-zinc-950/50"}`}>
      <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{r.name}{me && <span className="ml-1 text-[10px] text-orange-300">you</span>}</span>
      <span className="shrink-0 tabular-nums font-bold text-zinc-100">{r.wins}-{r.losses}</span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">{r.net > 0 ? "+" : ""}{r.net.toFixed(1)}</span>
    </div>
  );
}
