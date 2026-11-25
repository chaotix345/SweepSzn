"use client";
import { useEffect, useMemo, useState } from "react";
import { BADGES } from "@/lib/dex";
import { fetchDex, type DexData } from "@/lib/dexClient";
import { useSession } from "@/lib/useSession";
import { AUTH_ENABLED } from "@/lib/authClient";
import { Button, ButtonLink } from "@/components/ui/Button";
import { eraLabel } from "@/lib/teams";
import { TRAIT_META } from "@/lib/traits";
import { encodeDexShare } from "@/lib/share";
import { X_HANDLE } from "@/lib/site";
import { getOwnRefCode } from "@/lib/referral";

// The Drafted Dex collection screen. Local-first: built from this device's result history (lib/dexClient),
// unioned with the account's Dex when signed in, so it works without an account. Renders a completion
// counter, the milestone shelf, filters, and the player-card grid — all descriptive (DESIGN.md §12).

const TOTAL_PEOPLE = 2304; // unique real people in the draftable dataset

// Signed out (and auth configured): the Dex is saved on this device; signing in syncs it everywhere.
function SyncPrompt({ onSignIn, empty }: { onSignIn: () => void; empty?: boolean }) {
  return (
    <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
      <p className="text-sm text-zinc-400">
        {empty ? "Played on another device? Sign in to bring that Dex here." : "Saved on this device. Sign in to sync your Dex across devices."}
      </p>
      <Button variant="secondary" size="md" onClick={onSignIn} className="shrink-0">Sign in to sync</Button>
    </div>
  );
}

const Empty = ({ msg, children }: { msg: string; children?: React.ReactNode }) => (
  <div className="py-16 text-center">
    <h1 className="font-display text-3xl">Drafted Dex</h1>
    <p className="mt-2 text-zinc-400">{msg}</p>
    <ButtonLink href="/play" variant="secondary" className="mt-5">Play a round →</ButtonLink>
    {children}
  </div>
);

export function DexBoard() {
  const [data, setData] = useState<DexData | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ok">("loading");
  const { user, loading: sessionLoading, promptSignIn } = useSession();
  const uid = user?.uid ?? null;
  const [decade, setDecade] = useState("All");
  const [pos, setPos] = useState("All");
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  // Refetch when the account changes (signing in merges the account's Dex into the local one).
  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    fetchDex().then((d) => {
      if (!alive) return;
      if (d) { setData(d); setPhase("ok"); } else setPhase("error");
    });
    return () => { alive = false; };
  }, [uid, sessionLoading]);

  const decades = useMemo(() => (data ? [...new Set(data.players.map((p) => p.decade))].sort() : []), [data]);
  const filtered = useMemo(() => (data?.players ?? []).filter((p) =>
    (decade === "All" || p.decade === decade) && (pos === "All" || p.eligible.includes(pos))), [data, decade, pos]);
  const people = useMemo(() => (data ? new Set(data.players.map((p) => p.personId)).size : 0), [data]);

  if (phase === "loading") return <p className="py-16 text-center text-sm text-zinc-500">Loading your Dex…</p>;
  if (phase === "error") return <p className="py-16 text-center text-sm text-zinc-500">Couldn&apos;t load your Dex. Try again.</p>;
  if (!data) return null;
  const showSync = AUTH_ENABLED && !data.signedIn;
  if (!data.players.length) {
    return (
      <Empty msg="You haven't drafted anyone yet. Every player you field is saved here.">
        {showSync && <div className="mx-auto max-w-lg"><SyncPrompt onSignIn={promptSignIn} empty /></div>}
      </Empty>
    );
  }

  const earned = new Set(data.badges);
  // Share the collection: top players by fame (descriptive) + the collection/badge counts → /dex/s card.
  const shareDex = async () => {
    const topIds = [...data.players].sort((a, b) => b.fame - a.fame).slice(0, 10).map((p) => p.id);
    const card = encodeDexShare(topIds, data.players.length, data.badges.length);
    // every share doubles as a referral — append the sharer's code if minted (canonical is bare-path).
    const u = new URL(`/dex/s/${card}`, window.location.origin);
    const own = getOwnRefCode();
    if (own) u.searchParams.set("ref", own);
    const url = u.toString();
    const text = `My Drafted Dex: ${data.players.length} all-time players collected on SweepSzn. Build your own → via ${X_HANDLE}`;
    try { if (navigator.share) { await navigator.share({ title: "My Drafted Dex", text, url }); return; } } catch { /* dismissed */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setShareState("copied"); setTimeout(() => setShareState("idle"), 1800); } catch { /* ignore */ }
  };
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl leading-none">Drafted Dex</h1>
          <p className="mt-1 text-sm text-zinc-500">{data.players.length} card{data.players.length === 1 ? "" : "s"} · {data.total} recent game{data.total === 1 ? "" : "s"}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl leading-none tabular-nums text-orange-400">{people}</div>
          <div className="text-xs text-zinc-500">of {TOTAL_PEOPLE.toLocaleString()} players</div>
        </div>
      </div>
      {showSync && <SyncPrompt onSignIn={promptSignIn} />}
      <button onClick={shareDex} aria-label="Share your Dex"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:border-orange-500 hover:text-orange-300">
        {shareState === "copied" ? "Link copied ✓" : "📤 Share your Dex"}
      </button>

      <div className="mt-6">
        <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">Milestones · {earned.size}/{BADGES.length}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {BADGES.map((b) => {
            const got = earned.has(b.key);
            return (
              <span key={b.key} title={got ? b.hint : "Locked — keep drafting to discover"}
                className={`rounded-lg border px-2.5 py-1 text-xs ${got ? "border-orange-500/50 bg-orange-500/10 text-orange-300" : "border-zinc-800 bg-zinc-900/40 text-zinc-500"}`}>
                {got ? "★ " : "▦ "}{b.name}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
        <select value={decade} onChange={(e) => setDecade(e.target.value)} aria-label="Filter by decade"
          className="min-h-11 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-300">
          <option value="All">All decades</option>
          {decades.map((d) => <option key={d} value={d}>{eraLabel(d)}</option>)}
        </select>
        <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Filter by position"
          className="min-h-11 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-300">
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
