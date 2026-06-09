import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { getChallengePublic } from "@/lib/challengeStore";

type Props = { params: Promise<{ id: string }> };

const load = cache((id: string) => getChallengePublic(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const info = await load(id);
  if (!info) return { title: "SweepSzn — head-to-head challenge", robots: { index: false } };
  const title = `Beat ${info.creatorName}'s ${info.wins}-${info.losses} — SweepSzn challenge`;
  const description = `${info.creatorName} went ${info.wins}-${info.losses} (${info.grade}). Same draft, your picks. Can you build a better all-time five?`;
  return {
    title, description,
    robots: { index: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ChallengePage({ params }: Props) {
  const { id } = await params;
  const info = await load(id);
  const net = info ? `${info.net > 0 ? "+" : ""}${info.net.toFixed(1)}` : "";
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        <Link href="/" className="flex items-baseline text-2xl font-black tracking-tight">
          <span className="font-display">Sweep<span className="text-orange-500">Szn</span></span>
          <span className="ml-3 text-sm font-semibold text-zinc-500">head-to-head challenge</span>
        </Link>

        {info ? (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <div className="text-sm font-semibold uppercase tracking-widest text-zinc-500">You&apos;ve been challenged</div>
            <h1 className="mt-3 text-2xl font-black">
              Can you beat <span className="text-orange-400">{info.creatorName}</span>?
            </h1>
            <div className="mt-5 text-6xl font-black tabular-nums text-green-400">
              {info.wins}<span className="text-zinc-600">–</span>{info.losses}
            </div>
            <div className="mt-1 text-sm font-bold text-zinc-300">{info.grade} · Net {net}</div>
            <p className="mx-auto mt-4 max-w-sm text-sm text-zinc-400">
              You&apos;ll draft from the <strong className="text-zinc-200">same teams and eras</strong> — their five
              stays hidden until you submit yours. Pure judgment, no luck.
            </p>
            <Link href={`/?c=${info.id}#game`}
              className="mt-6 inline-block rounded-xl bg-orange-500 px-8 py-3 text-base font-black text-black hover:bg-orange-400">
              ⚔️ Accept Challenge
            </Link>
            {info.attempts > 1 && (
              <div className="mt-4 text-xs text-zinc-500">{info.attempts} players have taken this challenge</div>
            )}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <h1 className="text-xl font-black">This challenge isn&apos;t available</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-400">
              It may have expired, or challenges aren&apos;t configured right now. Build your own all-time five instead.
            </p>
            <Link href="/#game" className="mt-6 inline-block rounded-xl bg-orange-500 px-8 py-3 text-base font-black text-black hover:bg-orange-400">
              Build your five →
            </Link>
          </div>
        )}
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">engine calibrated to real NBA team-seasons</footer>
    </main>
  );
}
