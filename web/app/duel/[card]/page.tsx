import type { Metadata } from "next";
import { X_HANDLE, SITE_NAME } from "@/lib/site";
import { cache } from "react";
import { notFound } from "next/navigation";
import { resolveDuelCard } from "@/lib/duelBot";
import { personaInfo } from "@/lib/duel";
import DuelResult from "@/components/DuelResult";
import ShareHeader from "@/components/ShareHeader";
import Beacon from "@/components/Beacon";
import SkipLink from "@/components/SkipLink";

// Draft Duel share permalink: /duel/<persona>~<your five>.<bot five>. Both fives are re-evaluated from
// the ids (resolveDuelCard), so the matchup rebuilds with nothing stored — same scheme as /r/ and /sg/.

type Props = { params: Promise<{ card: string }> };

const load = cache((card: string) => resolveDuelCard(card));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { card } = await params;
  const d = load(card);
  if (!d) return { title: "SweepSzn — draft duel", robots: { index: false } };
  const name = personaInfo(d.persona).name;
  const score = `${d.you.result.wins}-${d.you.result.losses} vs ${d.bot.result.wins}-${d.bot.result.losses}`;
  const title = `${d.outcome === "w" ? `Beat ${name}` : d.outcome === "l" ? `${name} won` : `Tied ${name}`} ${score} — SweepSzn Draft Duel`;
  const description = `Same spins, snake draft, one all-time five each. ${score} against ${name}. Can you take the bot?`;
  return {
    title, description, robots: { index: false },
    openGraph: { title, description, siteName: SITE_NAME, type: "website", url: `/duel/${card}` },
    twitter: { card: "summary_large_image", title, description, site: X_HANDLE, creator: X_HANDLE },
  };
}

export default async function SharedDuel({ params }: Props) {
  const { card } = await params;
  const d = load(card);
  if (!d) notFound();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <SkipLink href="#share-content" />
      {/* Share-loop close + first-arrival visit (feeds sourceSplit.visit; device key shared with home). */}
      <Beacon name="share_view" />
      <Beacon name="visit" dedupe={{ scope: "device", key: "szn:ev:visit" }} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ShareHeader tagline="draft duel" cta="Duel the bot →" ctaHref="/play?mode=duel" />
        <div id="share-content" tabIndex={-1} className="outline-none">
        <h1 className="sr-only">{`Draft Duel against ${personaInfo(d.persona).name}: ${d.you.result.wins}-${d.you.result.losses} to ${d.bot.result.wins}-${d.bot.result.losses}`}</h1>
        <DuelResult persona={d.persona} outcome={d.outcome} you={d.you} bot={d.bot} card={card} shared />
        </div>
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-400">engine calibrated to real NBA team-seasons</footer>
    </main>
  );
}
