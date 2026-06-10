import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { decodeShare } from "@/lib/share";
import { decodePickemCard, pickemVerdict } from "@/lib/pickem";
import { SLOTS, displayName } from "@/lib/teams";
import ResultCard from "@/components/ResultCard";

// Pick'Em share permalink: /pe/<y>.<n>.<vote|x>.<lineup>. Same deterministic rebuild as
// /r/<lineup>, plus the crowd snapshot frozen at share time (counts keep moving in Redis;
// the card shows the moment the sharer bragged about).

type Props = { params: Promise<{ card: string }> };

const loadCard = cache((card: string) => {
  const dec = decodePickemCard(card);
  if (!dec) return null;
  const { ids, hinted } = decodeShare(dec.lineup);
  if (ids.length !== 5 || new Set(ids).size !== 5) return null;
  const players = getPlayersByIds(ids);
  if (players.length !== 5) return null;
  return { players, result: evaluateLineup(players, getCoefficients()), hinted, view: dec.view };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { card } = await params;
  const data = loadCard(card);
  if (!data) return { title: "SweepSzn — all-time NBA lineup", robots: { index: false } };
  const { result, players, view } = data;
  const names = players.map((p) => displayName(p.name)).join(", ");
  const v = pickemVerdict(result.wins, view);
  const crowd = v.crowd
    ? `The crowd said ${v.crowd === "y" ? "60+ wins" : "no shot"} (${v.pct}%) — ${v.crowdRight ? "right" : "wrong"}.`
    : "Crowd vs. you.";
  const title = `${result.wins}-${result.losses} (${result.grade}) — ${names} · SweepSzn Pick'Em`;
  const description = `${crowd} ${names} went ${result.wins}-${result.losses}. Can you beat the crowd?`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website", url: `/pe/${card}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedPickem({ params }: Props) {
  const { card } = await params;
  const data = loadCard(card);
  if (!data) notFound();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="flex items-baseline text-2xl tracking-tight">
          <span className="font-display">Sweep<span className="text-orange-500">Szn</span></span>
          <span className="ml-3 text-sm font-semibold text-zinc-500">a friend took on the crowd</span>
        </Link>
        <ResultCard result={data.result} players={data.players} slots={SLOTS} mode="shared" usedHints={data.hinted} shared pickem={data.view} />
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">
        engine calibrated to real NBA team-seasons
      </footer>
    </main>
  );
}
