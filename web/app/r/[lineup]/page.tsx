import type { Metadata } from "next";
import { X_HANDLE } from "@/lib/site";
import { cache } from "react";
import { notFound } from "next/navigation";
import { resolveSharedLineup } from "@/lib/sharedLineup";
import { SLOTS, displayName } from "@/lib/teams";
import ResultCard from "@/components/ResultCard";
import Beacon from "@/components/Beacon";
import ShareHeader from "@/components/ShareHeader";

type Props = { params: Promise<{ lineup: string }> };

// cache() dedupes the decode+evaluate across generateMetadata and the page render (same request).
// The decode/evaluate/validate logic lives in resolveSharedLineup (shared with /api/result + /compare).
const loadLineup = cache(resolveSharedLineup);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lineup } = await params;
  const data = loadLineup(lineup);
  // Per-lineup pages are noindex: they're shareable permalinks, not search content.
  if (!data) return { title: "SweepSzn — all-time NBA lineup", robots: { index: false } };
  const { result, players, prime, blueprint } = data;
  const names = players.map((p) => displayName(p.name)).join(", ");
  const net = `${result.netRtg > 0 ? "+" : ""}${result.netRtg.toFixed(1)}`;
  const title = `${result.wins}-${result.losses} (${result.grade}) — ${names} · SweepSzn${prime ? " Prime" : blueprint ? " Blueprint" : ""}`;
  const description = blueprint
    ? `${names} went ${blueprint.label} — ${result.wins}-${result.losses} (${result.label}) with ${blueprint.grade} blueprint execution. Can you out-execute them?`
    : prime
      ? `${names} — a cross-era PRIME five (every legend at his peak) projecting ${result.wins}-${result.losses} (${result.label}) — Net ${net}. Fantasy simulation. Can you build a better one?`
      : `${names} project to ${result.wins}-${result.losses} (${result.label}) — Net ${net}. Can you build a better all-time five?`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website", url: `/r/${lineup}` },
    twitter: { card: "summary_large_image", title, description, site: X_HANDLE, creator: X_HANDLE },
  };
}

export default async function SharedResult({ params }: Props) {
  const { lineup } = await params;
  const data = loadLineup(lineup);
  if (!data) notFound();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Share-loop close: count each view of a shared permalink (once per page view). */}
      <Beacon name="share_view" />
      {/* Many first-time arrivals land here, not on home — count them as visitors too, or the
          visitor→first-play denominator misses the whole share-acquisition path. Device-scoped key
          shared with home so a visitor who lands here then opens home is still one visit. */}
      <Beacon name="visit" dedupe={{ scope: "device", key: "szn:ev:visit" }} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ShareHeader tagline="a friend shared their five" cta="Can you beat this? →" />
        <ResultCard result={data.result} players={data.players} slots={SLOTS} mode="shared" usedHints={data.hinted} shared prime={data.prime} blueprint={data.blueprint ?? undefined} />
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">
        {data.prime
          ? "fantasy simulation, not historical — every legend at his peak"
          : "engine calibrated to real NBA team-seasons"}
      </footer>
    </main>
  );
}
