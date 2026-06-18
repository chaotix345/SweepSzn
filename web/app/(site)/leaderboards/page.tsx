import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import Leaderboard from "@/components/Leaderboard";
import Link from "next/link";
import { dayUTC } from "@/lib/day";

export const metadata: Metadata = {
  title: "SweepSzn leaderboards — Daily, Weekly, All-time",
  description:
    "Today's Daily leaderboard plus the Weekly and All-time boards. Everyone gets the same team and era spins each day — can you top the table?",
  alternates: { canonical: "/leaderboards" },
};

// The board date is request-time UTC (the Daily resets at UTC midnight), so render per request.
export const dynamic = "force-dynamic";

export default function Leaderboards() {
  const date = dayUTC();
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Leaderboards</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">Who&apos;s gone closest to <span className="whitespace-nowrap">82-0?</span></h1>
      <p className="mt-4 max-w-xl text-base text-zinc-400">
        In Daily mode everyone gets the same spins, so the board is a pure test of judgment. Weekly sums your best
        daily wins; All-time is your career total. Play today&apos;s Daily to post a score.
      </p>
      <Leaderboard date={date} trace={[]} readOnly />

      {/* Factor Hunt / Blueprint / Surgeon run their own separate daily boards — surface them here so
          they're discoverable; each board lives on that mode's result screen. */}
      <div className="mt-10">
        <div className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Other boards</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Factor Hunt", mode: "factorhunt", accent: "text-violet-400", tile: "bg-violet-500/15", desc: "Predict the engine's biggest factor for a leaderboard bonus." },
            { label: "Blueprint", mode: "blueprint", accent: "text-cyan-400", tile: "bg-cyan-500/15", desc: "Commit to a game plan; get graded on execution." },
            { label: "Surgeon", mode: "surgeon", accent: "text-rose-400", tile: "bg-rose-500/15", desc: "One swap to fix your lineup's worst factor." },
          ].map((b) => (
            <Link key={b.label} href={`/play?mode=${b.mode}`} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-600">
              <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${b.tile} ${b.accent}`}>{b.label}</span>
              <p className="mt-2 text-sm text-zinc-400">{b.desc}</p>
              <span className="mt-2 inline-block text-sm font-bold text-orange-400">Play →</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <ButtonLink href="/play?mode=daily" size="lg">Play today&apos;s Daily →</ButtonLink>
      </div>
    </div>
  );
}
