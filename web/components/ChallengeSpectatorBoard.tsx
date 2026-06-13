"use client";
import { useEffect, useState } from "react";
import type { ChallengeBoard } from "@/lib/types";

// Live scoreboard for a challenge link — polls the public board every 30s (paused when the tab is
// hidden) so spectators in a group chat can watch records climb without playing. Records only:
// every five stays hidden until you submit your own.
export default function ChallengeSpectatorBoard({ id }: { id: string }) {
  const [board, setBoard] = useState<ChallengeBoard | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/challenge/${id}/board`);
        if (!alive || !r.ok) return;
        const b = (await r.json()) as ChallengeBoard;
        if (alive) setBoard(b);
      } catch { /* keep the last good board on the screen */ }
    };
    tick();
    const iv = setInterval(() => { if (!document.hidden) tick(); }, 30000);
    const onFocus = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [id]);

  if (!board || board.total === 0) return null; // nothing to watch until someone plays

  return (
    <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400">Live leaderboard</h2>
        <span className="text-xs text-zinc-500">{board.total} {board.total === 1 ? "attempt" : "attempts"}</span>
      </div>
      <ol className="space-y-1.5">
        {board.top.map((r) => (
          <li key={r.rank} className="flex items-center gap-3 rounded-lg bg-zinc-950/60 px-3 py-2 text-sm">
            <span className="w-6 shrink-0 text-center font-black tabular-nums text-zinc-500">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{r.name}</span>
            <span className="shrink-0 font-bold tabular-nums text-zinc-100">{r.wins}-{r.losses}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-zinc-500">{r.net > 0 ? "+" : ""}{r.net.toFixed(1)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-center text-[11px] text-zinc-600">Updates live · records only — every five stays hidden until you play</p>
    </div>
  );
}
