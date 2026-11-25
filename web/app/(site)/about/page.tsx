import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import ResultPreview from "@/components/ResultPreview";
import { marketingMetadata } from "@/lib/marketingMeta";
import { bestFiveAnswer, perfectSeasonAnswer } from "@/lib/answers";
import { getLatestPlayers } from "@/lib/data";

export const metadata: Metadata = {
  ...marketingMetadata("about"),
  alternates: { canonical: "/about" },
};

// the box-score span of the card pool, so a new season's release updates the FAQ by itself
const years = getLatestPlayers().map((p) => p.year);
const FIRST_YEAR = years.reduce((a, b) => Math.min(a, b));
const LAST_YEAR = years.reduce((a, b) => Math.max(a, b));

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is SweepSzn free?",
    a: "Yes. It runs entirely in your browser, with no account required. Optional Google sign-in just lets you claim your leaderboard ranks and keep them across devices.",
  },
  perfectSeasonAnswer(),
  bestFiveAnswer(),
  {
    q: "How accurate is the engine?",
    a: "The core model is fit to 1,170 real NBA team-seasons (1985–2025) across 24,687 player-seasons. Given each player's actual season, the team model misses held-out real teams by about 5.6 wins on average against luck-adjusted win totals (6.1 against raw records, which carry roughly 2.4 wins of close-game luck). The card ratings the game uses are tested harder, from each player's other seasons only, and miss by about 8.1. The penalties for lineups real teams never field, like five point guards or five non-scorers, can't be fitted from real data, so they are reasoned and labeled that way. The How it works page shows the receipts: famous teams predicted cold, gimmick-lineup stress tests, and which parts are fitted versus reasoned.",
  },
  {
    q: "Why is it different from other lineup tools?",
    a: "Most all-time lineup tools just add up box-score averages, which rewards stacking five high-usage scorers. SweepSzn models finite possessions, usage overload, era-normalized stats, defense at full weight, spacing, and fit — and then explains, in plain English, what helped and what hurt.",
  },
  {
    q: "Where does the player data come from?",
    a: `Basketball-Reference box scores from ${FIRST_YEAR} to ${LAST_YEAR}, normalized per season so different eras can be compared fairly. Pre-1974 defense (before steals and blocks were tracked) is estimated honestly rather than guessed.`,
  },
  {
    q: "What are the game modes?",
    a: "Nine ways to play. Daily gives everyone the same spins each day and ranks results on a verified leaderboard with streaks. Classic shows full stats while you draft; HoopIQ hides them so you draft from memory. Challenge sends a friend the same spins to beat your record, and Draft Duel pits you against a bot (easy, medium or hard) drafting from the same spins in snake order. Then four modes that lean on the explainable engine: Factor Hunt asks you to predict which factor matters most before the reveal; Prime Draft drops the era reel so you can build cross-era fives with every legend in his best season with that franchise; Blueprint has you commit to a tactical objective (spacing, defense, usage discipline, rim, or balanced) before the spin and grades your execution on that axis; and Surgeon diagnoses your lineup's single worst factor and gives you one targeted swap to fix it, scored on the win delta.",
  },
  {
    q: "What makes Factor Hunt, Blueprint, and Surgeon possible?",
    a: "They all depend on the engine explaining itself. Because every result decomposes into named factors — usage overload, spacing, interior size, perimeter defense — the game can ask you to predict them (Factor Hunt), grade you on one of them (Blueprint), or diagnose and fix your worst one (Surgeon). A tool that only outputs a number can't do any of that.",
  },
];

export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-400">About</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">The honest all-time NBA team builder</h1>
      <p className="mt-4 text-base text-zinc-400">
        SweepSzn is a free browser game. Spin a franchise reel and an era reel, draft a five-player all-time NBA
        starting five, and the engine simulates a full 82-game season. The twist: it&apos;s honest. Instead of rewarding
        you for stacking five stat-stuffers, it models the things that actually win an NBA season — and then tells you
        exactly why your lineup goes 78-4 or 40-42.
      </p>
      <p className="mt-3 text-base text-zinc-400">
        The whole hook is the perfect season. Can you build a five that goes <strong className="text-zinc-200">82-0</strong>?
        It&apos;s sweep season.
      </p>

      <section className="mt-10">
        <p className="mb-4 text-sm text-zinc-400">
          Here&apos;s what a real engine result looks like — a balanced two-way GOAT five that still loses wins to usage overload.
        </p>
        <ResultPreview />
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl tracking-tight">FAQ</h2>
        <div className="mt-5 space-y-3">
          {FAQ.map((f, i) => (
            <details key={f.q} open={i < 2} className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-zinc-100 [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <span aria-hidden className="shrink-0 text-lg leading-none text-orange-400 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-12 border-t border-zinc-800 pt-10 text-center">
        <h2 className="font-display text-3xl tracking-tight">
          One way to find out if your five can go <span className="text-gold">82-0</span>.
        </h2>
        <div className="mt-5 flex justify-center">
          <ButtonLink href="/play?mode=daily" size="lg">Build your five →</ButtonLink>
        </div>
      </div>
    </div>
  );
}
