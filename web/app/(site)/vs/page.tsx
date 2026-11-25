import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { gradeColor } from "@/lib/grades";
import { jsonLdHtml } from "@/lib/jsonLd";
import { VS_MATCHUPS, vsPath } from "@/lib/vs";
import { fantasyNote, vsIndexJsonLd, vsIndexMetadata, vsView, type VsSideView } from "@/lib/vsServer";

export const metadata: Metadata = vsIndexMetadata();

function Line({ s }: { s: VsSideView }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-sm text-zinc-300">{s.label}</span>
      <span className={`shrink-0 font-display text-2xl tabular-nums ${gradeColor(s.result.grade)}`}>
        {s.result.wins}<span className="text-zinc-600">–</span>{s.result.losses}
      </span>
    </div>
  );
}

export default function VsIndex() {
  const views = VS_MATCHUPS.map((m) => vsView(m.slug)!);
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(vsIndexJsonLd()) }} />

      <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Head to head · fantasy sim</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">Famous NBA team debates, settled by an engine</h1>
      <p className="mt-4 max-w-2xl text-base text-zinc-400">
        The &apos;96 Bulls or the &apos;16 Warriors? Bird&apos;s Celtics or Magic&apos;s Lakers? Each side below is that team&apos;s
        real starting five, scored over 82 games by the same SweepSzn engine that grades your draft, with the
        factors behind every record.
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {views.map((v) => (
          <li key={v.m.slug}>
            <Link
              href={vsPath(v.m.slug)}
              className="group flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-600"
            >
              <span className="font-bold text-zinc-100">{v.short}</span>
              <div className="mt-3 space-y-1">
                <Line s={v.a} />
                <Line s={v.b} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{v.m.blurb}</p>
              <span className="mt-auto pt-3 text-xs font-semibold text-zinc-500 transition group-hover:text-zinc-300">
                See the breakdown →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-14 max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="font-display text-2xl tracking-tight">How to read these</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{fantasyNote()}</p>
        <p className="mt-3 text-sm text-zinc-400">
          <Link href="/how-it-works" className="font-semibold text-zinc-200 underline underline-offset-4 hover:text-white">See how the engine works</Link>
          {" · "}
          <Link href="/teams" className="font-semibold text-zinc-200 underline underline-offset-4 hover:text-white">All-time five for every franchise</Link>
        </p>
      </section>

      <div className="mt-12 border-t border-zinc-800 pt-10 text-center">
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
          Build a five that beats them all. Go for <span className="text-gold">82-0</span>.
        </h2>
        <div className="mt-5 flex justify-center">
          <ButtonLink href="/play" size="lg">Draft your own five →</ButtonLink>
        </div>
      </div>
    </div>
  );
}
