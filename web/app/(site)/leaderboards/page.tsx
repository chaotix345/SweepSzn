import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import Leaderboard from "@/components/Leaderboard";
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
      <p className="mt-2 max-w-xl text-sm text-zinc-500">
        Factor Hunt, Blueprint, and Surgeon run their own separate daily boards — prediction bonuses, execution
        multipliers, and win deltas never mix into the boards below. You&apos;ll find each board on its result screen.
      </p>

      <Leaderboard date={date} trace={[]} readOnly />

      <div className="mt-6 flex justify-center">
        <ButtonLink href="/play" size="lg">Play today&apos;s Daily →</ButtonLink>
      </div>
    </div>
  );
}
