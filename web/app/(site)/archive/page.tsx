import type { Metadata } from "next";
import DailyArchive from "@/components/DailyArchive";

export const metadata: Metadata = {
  title: "Daily archive — SweepSzn",
  description: "Replay any past SweepSzn Daily on that day's spins, then see the perfect five the engine found. Archive replays are unranked.",
  alternates: { canonical: "/archive" },
};

// W3 past-Daily archive. Static shell; the day list, what this device has played and each day's
// revealed perfect five all load on the client (time- and storage-dependent).
export default function ArchivePage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Daily archive</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">Every Daily, still playable</h1>
      <p className="mt-4 max-w-xl text-base text-zinc-400">
        Replay any past Daily on the spins everyone got that day, then compare your five with that day&apos;s perfect
        five. Replays are unranked: no leaderboard, streak or weekly credit. Today&apos;s Daily is the one that counts.
      </p>
      <DailyArchive />
    </div>
  );
}
