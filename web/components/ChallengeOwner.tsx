"use client";
import { useCallback, useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { getUid } from "@/lib/streak";
import { useSessionContext } from "@/components/SessionProvider";
import type { ChallengeOwnerView } from "@/lib/types";
import FiveStrip from "@/components/FiveStrip";
import PushPrompt from "@/components/PushPrompt";
import { gradeColor } from "@/lib/grades";

type State = "loading" | "ok" | "forbidden" | "notfound" | "disabled" | "error";

const gradeText = gradeColor; // single source of truth — DESIGN.md grade-color scale

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

// The creator's live dashboard for a challenge they made. Polls the creator-gated results endpoint so
// it updates as friends respond (the original bug: this screen used to be a frozen one-row snapshot).
// Stamps `?own=<id>` so a refresh restores it in place. Rendered both right after creation (inside the
// result screen) and standalone when re-opened from "Your results".
export default function ChallengeOwner({ id, created }: { id: string; created?: boolean }) {
  const { user } = useSessionContext();
  const [view, setView] = useState<ChallengeOwnerView | null>(null);
  const [state, setState] = useState<State>("loading");
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);

  const link = typeof window !== "undefined" ? new URL(`/c/${id}`, window.location.origin).toString() : `/c/${id}`;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true); track("share", { target: "challenge_owner" }); setTimeout(() => setCopied(false), 1500);
    } catch { setCopyErr(true); setTimeout(() => setCopyErr(false), 2500); }
  }, [link]);

  // Stamp the URL so a refresh lands back here (hold-your-place restore), clearing any result params.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("own") !== id) {
        u.searchParams.set("own", id);
        u.searchParams.delete("r"); u.searchParams.delete("m"); u.searchParams.delete("c");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch { /* no history API */ }
  }, [id]);

  // Poll for responders. Keep the last good view on a transient error (don't blank a live board), and
  // pause while the tab is hidden; refetch immediately on focus so returning to the tab feels current.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/challenge/${id}/results`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ uid: user?.uid ?? getUid() }), // signed in: the creator gate keys off the account
        });
        if (!alive) return;
        if (r.status === 503) { setState("disabled"); return; }
        if (r.status === 403) { setState("forbidden"); return; }
        if (r.status === 404) { setState("notfound"); return; }
        if (!r.ok) { setState((s) => (s === "loading" ? "error" : s)); return; }
        const v = (await r.json()) as ChallengeOwnerView;
        if (!alive) return;
        setView(v); setState("ok");
      } catch { if (alive) setState((s) => (s === "loading" ? "error" : s)); }
    };
    tick();
    const iv = setInterval(() => { if (!document.hidden) tick(); }, 10000);
    const onFocus = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(iv); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); };
  }, [id, user?.uid]);

  const card = "mt-4 rounded-2xl border border-orange-500/40 bg-zinc-900 p-5";

  if (state === "disabled") return <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">Challenges need server configuration right now.</div>;
  if (state === "forbidden") return <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">This challenge was created on a different device, so its results can&apos;t be shown here.</div>;
  if (state === "notfound") return <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">This challenge has expired or isn&apos;t available anymore.</div>;
  if (!view) return <div className={`${card} animate-pulse text-center text-sm text-zinc-500`}>{state === "error" ? "Couldn't load this challenge — retrying…" : "Loading your challenge…"}</div>;

  const c = view.creator;
  return (
    <div className={card}>
      <div className="text-center">
        <div className="text-sm font-black uppercase tracking-widest text-orange-400">{created ? "Challenge created" : "Your challenge"}</div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
          Send this link. The first friend to beat your <b className="text-zinc-200">{c.wins}-{c.losses}</b> from the same draft wins.
          {c.hinted && <span className="text-zinc-500"> (you drafted with hints)</span>}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <input readOnly value={link} aria-label="Challenge link" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none" />
        <button onClick={copy} className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400">
          {copied ? "Copied!" : copyErr ? "Copy failed" : "Copy link"}
        </button>
      </div>

      {/* opt into a push alert when a friend responds — only shown after creating (this screen) */}
      <PushPrompt />

      {/* the creator's own bar */}
      <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-center">
        <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Your five</div>
        <div className="mt-1 font-display text-4xl tabular-nums text-green-400">{c.wins}<span className="text-zinc-600">–</span>{c.losses}</div>
        <div className="mt-0.5 text-sm font-bold">
          <span className={gradeText(c.grade)}>{c.grade}</span>
          <span className="text-zinc-500"> · Net {signed(c.net)}{c.rank ? ` · #${c.rank} of ${view.total}` : ""}</span>
        </div>
        <div className="mt-3"><FiveStrip title="Your starting five" five={c.players} href={c.resultUrl} /></div>
      </div>

      {/* responders */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          <span>Challengers</span><span>{view.responders.length} {view.responders.length === 1 ? "player" : "players"} · updates live</span>
        </div>
        {view.responders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-5 text-center text-sm text-zinc-500">
            No one&apos;s taken it yet — send the link to start the rivalry.
          </div>
        ) : (
          <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
            {view.responders.map((r) => {
              const badge = r.outcome === "win" ? "text-red-400" : r.outcome === "loss" ? "text-green-400" : "text-amber-400";
              const label = r.outcome === "win" ? "beat you" : r.outcome === "loss" ? "you held" : "dead heat";
              const margin = r.outcome === "tie" ? "same record & net" : r.winsMargin === 0 ? `Net ${signed(r.netMargin)}` : `${Math.abs(r.winsMargin)} win${Math.abs(r.winsMargin) === 1 ? "" : "s"} · Net ${signed(r.netMargin)}`;
              return (
                <div key={`${r.rank}-${r.name}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="mb-2 flex items-center gap-3 text-sm">
                    <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{r.name}</span>
                    <span className="shrink-0 tabular-nums font-bold text-zinc-100">{r.wins}-{r.losses}</span>
                    <span className={`shrink-0 text-xs font-bold ${badge}`}>{label}</span>
                  </div>
                  <div className="mb-2 pl-9 text-[11px] text-zinc-500">{margin}</div>
                  <FiveStrip title={`${r.name}'s five`} five={r.players} href={r.resultUrl} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
