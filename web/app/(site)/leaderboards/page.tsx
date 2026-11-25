import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import Leaderboard from "@/components/Leaderboard";
import SecondaryBoards from "@/components/SecondaryBoards";
import { marketingMetadata } from "@/lib/marketingMeta";

export const metadata: Metadata = {
  ...marketingMetadata("leaderboards"),
  alternates: { canonical: "/leaderboards" },
};

// Static: <Leaderboard> resolves today's (UTC) board date on the client, so nothing here is
// request-time — no per-request render just to pass the date down.
export default function Leaderboards() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Leaderboards</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">Who&apos;s gone closest to <span className="whitespace-nowrap"><span className="text-gold">82-0</span>?</span></h1>
      <p className="mt-4 max-w-xl text-base text-zinc-400">
        In Daily mode everyone gets the same spins, so the board is a pure test of judgment. Weekly sums your best
        daily wins; All-time is your career total. Play today&apos;s Daily to post a score.
      </p>
      <Leaderboard trace={[]} readOnly />

      {/* Factor Hunt / Blueprint / Surgeon run their own daily boards; each shows up here only once it
          has entries today (an empty secondary board is noise next to the Daily). */}
      <SecondaryBoards />

      <div className="mt-6 flex justify-center">
        <ButtonLink href="/play?mode=daily" size="lg">Play today&apos;s Daily →</ButtonLink>
      </div>
    </div>
  );
}
