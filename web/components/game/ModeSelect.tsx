import React from "react";
import ResultsHistory from "@/components/ResultsHistory";
import type { Mode } from "@/components/game/types";

export function ModeSelect({ onPick, onOpenChallenge }: { onPick: (m: Mode) => void; onOpenChallenge: (challengeId: string) => void }) {
  const modes: { id: Mode; emoji: string; title: string; desc: string }[] = [
    { id: "daily", emoji: "📅", title: "Daily", desc: "Everyone gets the same spins today. Compare your record." },
    { id: "classic", emoji: "💯", title: "Classic", desc: "Full stats visible — draft on what you can see." },
    { id: "hoopiq", emoji: "🧠", title: "HoopIQ", desc: "Stats hidden — draft by memory, test your ball knowledge." },
    { id: "factorhunt", emoji: "🔮", title: "Factor Hunt", desc: "Daily shared spins — predict WHY before the reveal for a ×1.05 bonus." },
    { id: "prime", emoji: "⚡", title: "Prime Draft", desc: "No eras — every legend at his peak. Cross-era fives, fantasy simulation." },
    { id: "blueprint", emoji: "📐", title: "Blueprint", desc: "Commit to a tactical objective before the spin — the engine grades your execution." },
    { id: "surgeon", emoji: "🩺", title: "Surgeon", desc: "The engine diagnoses your worst factor. One swap to fix it — score is the win delta." },
    { id: "challenge", emoji: "⚔️", title: "Challenge a Friend", desc: "Build a five, send a link. They draft the same teams — beat your record." },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-center">
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Pick your mode</h1>
      <p className="mt-2 text-lg text-zinc-400">Build an all-time NBA starting five. Can you go undefeated?</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map((m) => (
          <button key={m.id} onClick={() => onPick(m.id)}
            className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition hover:border-orange-500 hover:bg-zinc-800/60">
            <div className="text-3xl">{m.emoji}</div>
            <div className="mt-2 font-bold">{m.title}</div>
            <div className="mt-1 text-sm text-zinc-400">{m.desc}</div>
            <div className="mt-3 text-sm font-bold text-orange-500 group-hover:underline">Play →</div>
          </button>
        ))}
      </div>
      <ResultsHistory onOpenChallenge={onOpenChallenge} />
      <p className="mt-8 text-xs text-zinc-600">Smarter engine: every team is scored by a model fit to 1,170 real NBA seasons — and it tells you <em>why</em>.</p>
    </div>
  );
}
