import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { decodeShare } from "@/lib/share";
import { bpFromCode, gradeBlueprint } from "@/lib/blueprint";
import { SLOTS, displayName } from "@/lib/teams";
import ResultCard from "@/components/ResultCard";

type Props = { params: Promise<{ lineup: string }> };

// cache() dedupes the lookup+evaluate across generateMetadata and the page render (same request).
const loadLineup = cache((lineup: string) => {
  const { ids, hinted, prime, bp } = decodeShare(lineup);
  // reject crafted URLs with the wrong count or duplicate ids (5 of the same player would otherwise
  // pass the length check and render a nonsensical fabricated record) — mirrors verifyTrace's guard
  if (ids.length !== 5 || new Set(ids).size !== 5) return null;
  const players = getPlayersByIds(ids);
  if (players.length !== 5) return null;
  const result = evaluateLineup(players, getCoefficients());
  // a b<code>~ prefix re-derives the blueprint execution grade from the same result (deterministic)
  const bpKey = bpFromCode(bp);
  return { players, result, hinted, prime, blueprint: bpKey ? gradeBlueprint(bpKey, result) : null };
});

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
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedResult({ params }: Props) {
  const { lineup } = await params;
  const data = loadLineup(lineup);
  if (!data) notFound();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="flex items-baseline text-2xl tracking-tight">
          <span className="font-display">Sweep<span className="text-orange-500">Szn</span></span>
          <span className="ml-3 text-sm font-semibold text-zinc-500">a friend shared their five</span>
        </Link>
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
