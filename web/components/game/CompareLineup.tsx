"use client";
import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import Link from "next/link";
import type { Player, LineupResult } from "@/lib/types";
import { FAMOUS_TEAMS, historyAnchor, fmtNet } from "@/lib/explain";
import { extractLineupSegment } from "@/lib/share";
import { avgZ } from "@/lib/radar";
import { ZRadar } from "@/components/game/ZRadar";

// Post-game compare. Two descriptive, post-commit views (DESIGN.md §12): "vs Real Team" puts your
// five's already-shown projected ratings beside a famous team's actuals (a yardstick); "vs a Friend"
// resolves a pasted /r/ link (GET /api/result) and plots both real five-man lineups on a shared
// z-radar. No engine-internal field, no "who's better" verdict — just two records side by side.

interface FriendData { players: Player[]; result: LineupResult }
const ORANGE = "#ff6a00";
const CYAN = "#38bdf8";

function RatingTable({ you, them }: {
  you: { ortg: number; drtg: number; net: number };
  them: { label: string; ortg: number; drtg: number; net: number };
}) {
  const rows = [
    { label: "Your five (projected)", ortg: you.ortg, drtg: you.drtg, net: you.net, you: true },
    { label: `${them.label} (actual)`, ortg: them.ortg, drtg: them.drtg, net: them.net, you: false },
  ];
  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="grid grid-cols-[1fr_3.25rem_3.25rem_3.25rem] gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
        <span /><span className="text-right">ORtg</span><span className="text-right">DRtg</span><span className="text-right">Net</span>
      </div>
      <div className="mt-1 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_3.25rem_3.25rem_3.25rem] items-center gap-1 text-[11px] tabular-nums">
            <span className={`truncate ${r.you ? "font-semibold text-zinc-200" : "text-zinc-400"}`}>{r.label}</span>
            <span className="text-right text-zinc-300">{r.ortg.toFixed(1)}</span>
            <span className="text-right text-zinc-300">{r.drtg.toFixed(1)}</span>
            <span className={`text-right ${r.net >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtNet(r.net)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecordPill({ label, wins, losses, grade }: { label: string; wins: number; losses: number; grade: string }) {
  return (
    <div className="rounded-xl bg-zinc-950/60 p-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="font-display text-2xl tabular-nums text-zinc-100">{wins}<span className="text-zinc-600">–</span>{losses}</div>
      <div className="text-[11px] text-zinc-400">{grade}</div>
    </div>
  );
}

export function CompareLineup({ players, result, lineupSeg }: { players: Player[]; result: LineupResult; lineupSeg: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"team" | "friend">("team");
  // default the team picker to the comparable win-band team (else the top of the curated list)
  const matched = historyAnchor(result.wins);
  const [teamIdx, setTeamIdx] = useState(() => {
    const i = matched ? FAMOUS_TEAMS.findIndex((t) => t.name === matched.name && t.year === matched.year) : 0;
    return i >= 0 ? i : 0;
  });
  const [link, setLink] = useState("");
  const [friend, setFriend] = useState<FriendData | null>(null);
  // the segment captured AT FETCH TIME — so the "share this matchup" link can't drift if the user
  // keeps typing in the box after a successful compare.
  const [friendSeg, setFriendSeg] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ok">("idle");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function loadFriend() {
    const seg = extractLineupSegment(link);
    if (!seg) { setStatus("error"); setFriend(null); setFriendSeg(null); return; }
    setStatus("loading"); setFriend(null); setFriendSeg(null);
    try {
      const r = await fetch(`/api/result/${seg}`);
      if (!r.ok) { setStatus("error"); return; }
      const d = await r.json();
      setFriend({ players: d.players, result: d.result });
      setFriendSeg(seg);
      setStatus("ok");
      track("compare_friend");
    } catch { setStatus("error"); }
  }

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); track("compare_open"); }} aria-label="Compare your lineup"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 py-2.5 text-sm font-bold text-zinc-300 transition hover:border-cyan-600/60 hover:text-cyan-300">
        ⚖️ Compare lineup — vs a real team or a friend
      </button>
    );
  }

  const team = FAMOUS_TEAMS[teamIdx];

  return (
    <div role="dialog" aria-modal="true" aria-label="Compare lineup"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black uppercase tracking-widest text-cyan-400">⚖️ Compare</span>
          <button onClick={() => setOpen(false)} aria-label="Close compare" className="px-1 text-zinc-400 hover:text-zinc-200">✕</button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-zinc-950/70 p-1 text-xs font-semibold">
          <button onClick={() => setTab("team")} aria-pressed={tab === "team"}
            className={`rounded-md py-1.5 ${tab === "team" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}>vs Real Team</button>
          <button onClick={() => setTab("friend")} aria-pressed={tab === "friend"}
            className={`rounded-md py-1.5 ${tab === "friend" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}>vs a Friend</button>
        </div>

        {tab === "team" ? (
          <div className="mt-3">
            <select value={teamIdx} onChange={(e) => setTeamIdx(Number(e.target.value))} aria-label="Pick a famous team"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-200">
              {FAMOUS_TEAMS.map((t, i) => (
                <option key={t.name + t.year} value={i}>{t.record} {t.team} ({t.season})</option>
              ))}
            </select>
            <RatingTable
              you={{ ortg: result.ortg, drtg: result.drtg, net: result.netRtg }}
              them={{ label: `${team.record} ${team.team}`, ortg: team.ortg, drtg: team.drtg, net: team.nrtg }}
            />
            <p className="mt-2 text-[10px] leading-snug text-zinc-600">
              Your five&apos;s engine projection beside {team.team}&apos;s actual {team.season} ratings — a real-history yardstick, not a fit score.
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <label htmlFor="cmp-friend-link" className="block text-xs text-zinc-400">Paste a friend&apos;s result link</label>
            <div className="mt-1 flex gap-2">
              <input id="cmp-friend-link" value={link} onChange={(e) => setLink(e.target.value)}
                placeholder="Paste a friend's result link (sweepszn.com/r/…)"
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
              <button onClick={loadFriend} aria-label="Compare with friend" disabled={status === "loading"}
                className="shrink-0 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-bold text-black transition hover:bg-cyan-400 disabled:opacity-50">
                {status === "loading" ? "…" : "Compare"}
              </button>
            </div>
            {status === "error" && <p className="mt-2 text-xs text-zinc-400">Couldn&apos;t find that five — check the link and try again.</p>}
            {status === "ok" && friend && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <RecordPill label="Your five" wins={result.wins} losses={result.losses} grade={result.grade} />
                  <RecordPill label="Their five" wins={friend.result.wins} losses={friend.result.losses} grade={friend.result.grade} />
                </div>
                <div className="mt-3 flex justify-center">
                  <ZRadar players={[
                    { label: "You", z: avgZ(players), color: ORANGE },
                    { label: "Friend", z: avgZ(friend.players), color: CYAN },
                  ]} />
                </div>
                <RatingTable
                  you={{ ortg: result.ortg, drtg: result.drtg, net: result.netRtg }}
                  them={{ label: "Their five", ortg: friend.result.ortg, drtg: friend.result.drtg, net: friend.result.netRtg }}
                />
                {friendSeg && (
                  <Link href={`/compare/${lineupSeg}/${friendSeg}`}
                    className="mt-3 block rounded-xl border border-zinc-700 py-2 text-center text-xs font-semibold text-zinc-300 transition hover:border-cyan-500 hover:text-cyan-300">
                    Share this matchup →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
