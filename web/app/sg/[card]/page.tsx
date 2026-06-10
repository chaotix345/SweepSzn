import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { decodeSurgeonCard, surgeonDiagnosis } from "@/lib/surgeon";
import { displayName } from "@/lib/teams";
import SurgeonResult from "@/components/SurgeonResult";

// Surgeon share permalink: /sg/<beforeIds>.<outIdx>.<inId>. Both lineups are deterministic from
// the ids, so the full BEFORE/AFTER story (records, factor breakdowns, the delta) rebuilds with
// nothing stored server-side — same scheme as /r/ and /pe/.

type Props = { params: Promise<{ card: string }> };

const loadCard = cache((card: string) => {
  const dec = decodeSurgeonCard(card);
  if (!dec) return null;
  const beforePlayers = getPlayersByIds(dec.beforeIds);
  const afterPlayers = getPlayersByIds(dec.afterIds);
  if (beforePlayers.length !== 5 || afterPlayers.length !== 5) return null;
  // mirror verifyTrace's person-dupe guard against crafted URLs — BOTH lineups (distinct ids
  // can still be two era-variants of the same person)
  if (new Set(beforePlayers.map((p) => p.person_id ?? p.id)).size !== 5) return null;
  if (new Set(afterPlayers.map((p) => p.person_id ?? p.id)).size !== 5) return null;
  const c = getCoefficients();
  const before = evaluateLineup(beforePlayers, c);
  const after = evaluateLineup(afterPlayers, c);
  const diagnosis = surgeonDiagnosis(before.factors);
  if (!diagnosis) return null;
  return { before, after, beforePlayers, afterPlayers, outIdx: dec.outIdx, diagnosis };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { card } = await params;
  const data = loadCard(card);
  if (!data) return { title: "SweepSzn — surgeon swap", robots: { index: false } };
  const { before, after, afterPlayers, diagnosis } = data;
  const delta = after.wins - before.wins;
  const names = afterPlayers.map((p) => displayName(p.name)).join(", ");
  const title = `${delta > 0 ? "+" : ""}${delta} wins with one swap — SweepSzn Surgeon`;
  const description = `Diagnosis: ${diagnosis.canonical}. ${before.wins}-${before.losses} → ${after.wins}-${after.losses} (${names}). Can you out-operate them?`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website", url: `/sg/${card}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedSurgeon({ params }: Props) {
  const { card } = await params;
  const data = loadCard(card);
  if (!data) notFound();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="flex items-baseline text-2xl tracking-tight">
          <span className="font-display">Sweep<span className="text-orange-500">Szn</span></span>
          <span className="ml-3 text-sm font-semibold text-zinc-500">a friend fixed their five</span>
        </Link>
        <SurgeonResult before={data.before} after={data.after} beforePlayers={data.beforePlayers}
          afterPlayers={data.afterPlayers} outIdx={data.outIdx} diagnosis={data.diagnosis} card={card} shared />
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">
        engine calibrated to real NBA team-seasons — and it tells you why
      </footer>
    </main>
  );
}
