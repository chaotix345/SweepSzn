import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decodeDexShare } from "@/lib/share";
import { getPlayersByIds } from "@/lib/data";
import { teamColors, initials, eraLabel, displayName } from "@/lib/teams";
import { ButtonLink } from "@/components/ui/Button";

type Props = { params: Promise<{ card: string }> };

// A shared snapshot of someone's Drafted Dex — collection size + badge count + the top collected
// players (decoded from the URL card, resolved to real player rows). Descriptive only (DESIGN.md §12).
const load = cache((card: string) => {
  const d = decodeDexShare(card);
  if (!d) return null;
  const players = getPlayersByIds(d.ids);
  if (!players.length) return null;
  return { players, count: d.count, badges: d.badges };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { card } = await params;
  const data = load(card);
  if (!data) return { title: "SweepSzn — Drafted Dex", robots: { index: false } };
  const title = `My Drafted Dex — ${data.count} players collected · SweepSzn`;
  const description = `${data.count} all-time players collected across ${data.badges} milestone badges on SweepSzn. Build your own five and start your Dex.`;
  return {
    title, description, robots: { index: false },
    openGraph: { title, description, type: "website", url: `/dex/s/${card}` },
    twitter: { card: "summary_large_image", title, description, site: "@SweepSeason", creator: "@SweepSeason" },
  };
}

export default async function SharedDex({ params }: Props) {
  const { card } = await params;
  const data = load(card);
  if (!data) notFound();
  const { players, count, badges } = data;
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="flex items-baseline text-2xl tracking-tight">
            <span className="font-display">Sweep<span className="text-orange-500">Szn</span></span>
            <span className="ml-3 text-sm font-semibold text-zinc-500">a friend&apos;s Drafted Dex</span>
          </Link>
          <ButtonLink href="/play" size="sm">Build your own →</ButtonLink>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="font-display text-5xl leading-none text-orange-400">{count}</div>
              <div className="mt-1 text-sm text-zinc-500">players collected</div>
            </div>
            <div className="text-right">
              <div className="font-display text-4xl leading-none text-zinc-100">{badges}</div>
              <div className="text-xs text-zinc-500">milestone badges</div>
            </div>
          </div>

          <div className="mt-5 text-xs font-bold uppercase tracking-wide text-zinc-500">Top of the collection</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {players.map((p) => {
              const c = teamColors(p.team);
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-black"
                    style={{ background: c.bg, color: c.text }}>{initials(p.name)}</div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{displayName(p.name)}</div>
                    <div className="truncate text-[11px] text-zinc-500">{p.team} · {eraLabel(p.decade)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 text-center">
          <ButtonLink href="/play">Start your own Dex →</ButtonLink>
        </div>
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">every player-season you field is saved to your Dex</footer>
    </main>
  );
}
