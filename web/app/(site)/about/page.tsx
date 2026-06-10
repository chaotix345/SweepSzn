import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About SweepSzn",
  description:
    "SweepSzn is a free browser game: draft a five-player all-time NBA lineup and get a simulated 82-game record from an engine calibrated to real history — one that tells you why your five wins or loses.",
  alternates: { canonical: "/about" },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is SweepSzn free?",
    a: "Yes. It runs entirely in your browser, with no account required. Optional Google sign-in just lets you claim your leaderboard ranks and keep them across devices.",
  },
  {
    q: "Can you really go 82-0?",
    a: "Yes — an undefeated season is achievable, but the engine makes it brutally hard. You need a genuinely balanced two-way five, not five ball-dominant scorers. Going 82-0 is the whole challenge.",
  },
  {
    q: "How accurate is the engine?",
    a: "Every coefficient is fit to 1,170 real NBA team-seasons (1985–2025) across 24,687 player-seasons, with out-of-sample accuracy of about 6.07 wins RMSE in year-grouped cross-validation. Wins come from a Pythagorean expectation. It is calibrated to history, not hand-tuned.",
  },
  {
    q: "Why is it different from other lineup tools?",
    a: "Most all-time lineup tools just add up box-score averages, which rewards stacking five high-usage scorers. SweepSzn models finite possessions, usage overload, era-normalized stats, defense at full weight, spacing, and fit — and then explains, in plain English, what helped and what hurt.",
  },
  {
    q: "Where does the player data come from?",
    a: "Basketball-Reference box scores from 1950 to 2025, normalized per season so different eras can be compared fairly. Pre-1974 defense (before steals and blocks were tracked) is estimated honestly rather than guessed.",
  },
  {
    q: "What are the game modes?",
    a: "Eight ways to play. Daily gives everyone the same spins each day and ranks results on a verified leaderboard with streaks. Classic shows full stats while you draft; HoopIQ hides them so you draft from memory. Challenge sends a friend the same spins to beat your record. Then four modes that lean on the explainable engine: Factor Hunt asks you to predict which factor matters most before the reveal; Prime Draft drops the era reel so you can build cross-era fives with every legend at his peak; Blueprint has you commit to a tactical objective (spacing, defense, usage discipline, rim, or balanced) before the spin and grades your execution on that axis; and Surgeon diagnoses your lineup's single worst factor and gives you one targeted swap to fix it, scored on the win delta.",
  },
  {
    q: "What makes Factor Hunt, Blueprint, and Surgeon possible?",
    a: "They all depend on the engine explaining itself. Because every result decomposes into named factors — usage overload, spacing, interior size, perimeter defense — the game can ask you to predict them (Factor Hunt), grade you on one of them (Blueprint), or diagnose and fix your worst one (Surgeon). A tool that only outputs a number can't do any of that.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};
const faqLdHtml = JSON.stringify(faqLd).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

export default function About() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLdHtml }} />

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

      <section className="mt-12">
        <h2 className="font-display text-2xl tracking-tight">FAQ</h2>
        <dl className="mt-5 space-y-5">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <dt className="text-sm font-black text-zinc-100">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-zinc-400">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-12 text-center">
        <Link
          href="/play"
          className="inline-block rounded-xl bg-orange-500 px-8 py-3 text-base font-black text-black shadow-lg transition hover:bg-orange-400"
        >
          Build your five →
        </Link>
      </div>
    </div>
  );
}
