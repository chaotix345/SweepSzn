"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import ResultsHistory from "@/components/ResultsHistory";
import { ModeGlyph } from "@/components/game/modeIcons";
import { CloseIcon } from "@/components/ui/icons";
import { listResults, type ResultEntry } from "@/lib/resultHistory";
import { dayUTC } from "@/lib/day";
import type { Mode } from "@/components/game/types";

// Per-mode accent (DESIGN.md): orange = core/social, violet = Factor Hunt / Prime, cyan = Blueprint,
// rose = Surgeon. All literal class strings so Tailwind can see them.
const ACCENT = {
  orange: { text: "text-orange-400", tile: "bg-orange-500/15", dot: "bg-orange-400" },
  violet: { text: "text-violet-400", tile: "bg-violet-500/15", dot: "bg-violet-400" },
  cyan: { text: "text-cyan-400", tile: "bg-cyan-500/15", dot: "bg-cyan-400" },
  rose: { text: "text-rose-400", tile: "bg-rose-500/15", dot: "bg-rose-400" },
} as const;
type AccentKey = keyof typeof ACCENT;

// The six "pick a discipline" modes (Daily is featured above, Challenge is a full-width invite below).
const MODES: { id: Mode; title: string; desc: string; accent: AccentKey; diff: 1 | 2 | 3 }[] = [
  { id: "classic", title: "Classic", desc: "Full stats visible — draft on what you can see.", accent: "orange", diff: 1 },
  { id: "factorhunt", title: "Factor Hunt", desc: "Draft your five, then guess what the engine rewards or punishes most. Call it right, earn a bonus.", accent: "violet", diff: 2 },
  { id: "prime", title: "Prime Draft", desc: "No eras — every legend at his peak. Build cross-era fives.", accent: "violet", diff: 2 },
  { id: "hoopiq", title: "HoopIQ", desc: "Stats hidden — draft from memory and test your ball knowledge.", accent: "orange", diff: 3 },
  { id: "blueprint", title: "Blueprint", desc: "Pick a game plan before the spin. The engine grades how well you follow it.", accent: "cyan", diff: 3 },
  { id: "surgeon", title: "Surgeon", desc: "The engine finds your lineup's weakest link. One swap to fix it.", accent: "rose", diff: 3 },
];

const DIFF_LABEL = ["", "Beginner", "Intermediate", "Expert"] as const;

function DiffDots({ level, dot }: { level: 1 | 2 | 3; dot: string }) {
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`Difficulty: ${DIFF_LABEL[level]}`} title={DIFF_LABEL[level]}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? dot : "bg-zinc-700"}`} />
      ))}
    </span>
  );
}

export function ModeSelect({ onPick, onOpenChallenge }: { onPick: (m: Mode) => void; onOpenChallenge: (challengeId: string) => void }) {
  const [showIntro, setShowIntro] = useState(false);
  // First visit only: read the flag after mount (avoids SSR/hydration mismatch), show the 10-second
  // orientation, and remember the dismissal.
  useEffect(() => {
    // async IIFE keeps the setState out of the effect body (react-hooks/set-state-in-effect — repo idiom)
    (async () => {
      try { if (!localStorage.getItem("sweepszn_seen_modes")) setShowIntro(true); } catch { /* private mode */ }
    })();
  }, []);
  const dismissIntro = () => {
    try { localStorage.setItem("sweepszn_seen_modes", "1"); } catch { /* private mode */ }
    setShowIntro(false);
  };

  const [history, setHistory] = useState<ResultEntry[] | null>(null);
  // read after mount (hydration-safe, like ResultsHistory). null until then → no returning-user UI on SSR.
  useEffect(() => { (async () => { try { setHistory(listResults()); } catch { /* private mode */ } })(); }, []);
  // Returning-user fast path: most recent SOLO game's mode (daily is featured above; challenge has its own).
  const lastReplay = history?.find((e) => e.mode !== "daily" && e.mode !== "challenge");
  const lastReplayMode = MODES.find((m) => m.id === lastReplay?.mode);
  // Daily already played today? Deep-link to its result instead of re-drafting the already-scored board.
  const dailyToday = history?.find((e) => e.mode === "daily" && dayUTC(new Date(e.ts)) === dayUTC());

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 text-center sm:py-12">
      <h1 className="font-display text-3xl tracking-tight sm:text-5xl">Pick your mode</h1>
      <p className="mt-2 text-lg text-zinc-400">Build an all-time NBA starting five. Can you go undefeated?</p>

      {showIntro && (
        <div className="relative mx-auto mt-6 max-w-xl rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 pr-10 text-left text-sm text-zinc-300">
          <span className="font-bold text-orange-400">New here?</span>{" "}
          Spin a team + era reel → draft your five → simulate 82 games. Under two minutes.{" "}
          <span className="text-zinc-400">Daily is the best place to start.</span>
          <button
            onClick={dismissIntro}
            aria-label="Dismiss"
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition hover:text-zinc-200"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Featured: Daily — the obvious, low-commitment first play */}
      <button
        onClick={() => (dailyToday ? window.location.assign(`/r/${dailyToday.encoded}`) : onPick("daily"))}
        aria-label={dailyToday ? "View today's Daily result" : "Play Daily mode — recommended for new players"}
        className="group mt-5 block w-full overflow-hidden rounded-2xl border border-orange-500/40 bg-gradient-to-br from-orange-500/10 to-zinc-900 p-6 text-left ring-1 ring-orange-500/10 transition hover:border-orange-500 hover:ring-orange-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:mt-8 sm:p-7"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-orange-300">
          {dailyToday ? "✓ You played today" : "★ Recommended · start here"}
        </span>
        <div className="mt-3 flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
            <ModeGlyph mode="daily" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="font-display text-2xl tracking-tight">Daily</div>
            <p className="mt-1 text-sm text-zinc-400">
              Everyone gets the same spins today — a pure test of judgment. Post a score on the verified leaderboard.
            </p>
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-1 text-sm font-black text-orange-400 transition-all group-hover:gap-2">
          {dailyToday ? "View today's result →" : "Play Daily →"}
        </div>
      </button>

      {/* Returning-user fast path: jump straight back into your last solo mode */}
      {lastReplayMode && (
        <button
          onClick={() => onPick(lastReplayMode.id)}
          className="group mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm font-bold text-orange-400 transition hover:border-zinc-600"
        >
          ↻ Play {lastReplayMode.title} again
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </button>
      )}

      {/* The six disciplines */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m) => {
          const a = ACCENT[m.accent];
          return (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              aria-label={`Play ${m.title} mode`}
              className="group flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition hover:-translate-y-0.5 hover:border-zinc-600 hover:shadow-[0_10px_28px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.tile} ${a.text}`}>
                  <ModeGlyph mode={m.id} className="h-5 w-5" />
                </span>
                <DiffDots level={m.diff} dot={a.dot} />
              </div>
              <div className="mt-3 font-bold text-zinc-100">{m.title}</div>
              <p className="mt-1 flex-1 text-sm text-zinc-400">{m.desc}</p>
              <div className={`mt-3 text-sm font-bold ${a.text} group-hover:underline`}>Play →</div>
            </button>
          );
        })}
      </div>

      {/* Invite: Challenge a Friend — full-width, distinct from the solo disciplines */}
      <button
        onClick={() => onPick("challenge")}
        aria-label="Challenge a friend"
        className="group mt-4 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition hover:border-zinc-600 hover:shadow-[0_10px_28px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
          <ModeGlyph mode="challenge" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-zinc-100">Challenge a Friend</div>
          <p className="mt-0.5 text-sm text-zinc-400">Build a five, send a link. They draft the same teams — beat your record.</p>
        </div>
        <span className="shrink-0 text-sm font-bold text-orange-400 group-hover:underline">Play →</span>
      </button>

      <ResultsHistory onOpenChallenge={onOpenChallenge} />

      <Link href="/dex"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-zinc-700 hover:text-orange-300">
        🗂️ Your Drafted Dex →
      </Link>

      <p className="mt-8 text-xs text-zinc-500">
        Smarter engine: every team is scored by a model fit to 1,170 real NBA seasons — and it tells you <em>why</em>.
      </p>
    </div>
  );
}
