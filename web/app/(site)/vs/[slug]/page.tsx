import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { ZRadar } from "@/components/game/ZRadar";
import { factorViews, fmtNet } from "@/lib/explain";
import { gradeColor } from "@/lib/grades";
import { avgZ } from "@/lib/radar";
import { displayName, teamColors } from "@/lib/teams";
import { VS_MATCHUPS, matchupShort, vsPath } from "@/lib/vs";
import { fantasyNote, vsJsonLdHtml, vsMetadata, vsStaticParams, vsView, type VsSideView } from "@/lib/vsServer";

type Props = { params: Promise<{ slug: string }> };

// The curated matchups are prerendered at build; any other slug 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return vsStaticParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return vsMetadata((await params).slug) ?? {};
}

const A_COLOR = "#ff6a00";
const B_COLOR = "#38bdf8";
const yr = (y: number) => `'${String(y).slice(2)}`;

function SideCard({ s, color, tag }: { s: VsSideView; color: string; tag: string }) {
  const { result } = s;
  const c = teamColors(s.side.team);
  return (
    <section aria-label={`${s.label} starting five`} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div aria-hidden className="h-1.5" style={{ background: c.bg }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {tag}
        </div>
        <h2 className="mt-1 text-lg font-black text-zinc-100">{s.label}</h2>
        <p className="text-xs text-zinc-500">Real record {s.side.record}</p>
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Engine projection</div>
        <div className={`font-display text-6xl tabular-nums ${gradeColor(result.grade)}`}>
          {result.wins}<span className="text-zinc-600">–</span>{result.losses}
        </div>
        <div className="text-sm font-bold">
          <span className={gradeColor(result.grade)}>{result.grade}</span> <span className="text-zinc-300">{result.label}</span>
        </div>
        <div className="mt-2 flex gap-3 text-xs tabular-nums text-zinc-400">
          <span>ORtg <b className="text-zinc-200">{result.ortg.toFixed(1)}</b></span>
          <span>DRtg <b className="text-zinc-200">{result.drtg.toFixed(1)}</b></span>
          <span>Net <b className={result.netRtg >= 0 ? "text-green-400" : "text-red-400"}>{fmtNet(result.netRtg)}</b></span>
        </div>
        <ol className="mt-4 divide-y divide-zinc-800 border-t border-zinc-800">
          {s.slots.map(({ slot, player }) => (
            <li key={player.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-7 shrink-0 font-mono text-[11px] font-bold text-zinc-500">{slot}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-200">{displayName(player.name)}</span>
              <span className="shrink-0 font-mono text-[11px] text-zinc-500">{yr(player.year)} card</span>
            </li>
          ))}
        </ol>
        <Link href={s.href} className="mt-3 inline-block text-xs font-semibold text-zinc-400 underline underline-offset-4 hover:text-zinc-200">
          Open as a result card →
        </Link>
      </div>
    </section>
  );
}

function Factors({ s, color }: { s: VsSideView; color: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-black text-zinc-100">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {s.label}: why {s.result.wins}-{s.result.losses}
      </h3>
      <ul className="mt-3 space-y-3">
        {factorViews(s.result).map((f) => (
          <li key={f.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-zinc-300">{f.label}</span>
              <span className={`shrink-0 font-mono font-semibold tabular-nums ${f.value >= 0 ? "text-green-400" : "text-red-400"}`}>
                {f.value > 0 ? "+" : ""}{f.value.toFixed(1)}
                {f.winsEst != null && f.winsEst !== 0 && (
                  <span className="ml-1.5 text-[11px] text-zinc-500">{f.winsEst > 0 ? "+" : "−"}{Math.abs(f.winsEst)}W</span>
                )}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{f.blurb}</p>
          </li>
        ))}
      </ul>
      {s.result.notes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-[11px] leading-snug text-zinc-500">
          {s.result.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

export default async function VsPage({ params }: Props) {
  const { slug } = await params;
  const v = vsView(slug);
  if (!v) notFound();
  const jsonLd = vsJsonLdHtml(slug);
  const others = VS_MATCHUPS.filter((m) => m.slug !== slug);

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}

      <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
        <Link href="/vs" className="hover:text-zinc-300">Head to head</Link>
        <span aria-hidden className="mx-1.5">/</span>
        <span className="text-zinc-400">{v.short}</span>
      </nav>

      <p className="mt-4 text-xs font-bold uppercase tracking-widest text-orange-400">Head to head · fantasy sim</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">{v.title}</h1>
      <p className="mt-4 max-w-2xl text-base text-zinc-400">{v.m.blurb}</p>
      <p className="mt-4 max-w-2xl rounded-2xl border border-zinc-800 border-l-2 border-l-orange-500 bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-200">
        {v.verdict}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <SideCard s={v.a} color={A_COLOR} tag="Five A" />
        <SideCard s={v.b} color={B_COLOR} tag="Five B" />
      </div>

      <section aria-labelledby="why-heading" className="mt-12">
        <h2 id="why-heading" className="font-display text-2xl tracking-tight sm:text-3xl">Why each record</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Every factor in net rating points per 100 possessions, with its cost or gain in wins where the engine
          measures one. The same breakdown a drafted five gets.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Factors s={v.a} color={A_COLOR} />
          <Factors s={v.b} color={B_COLOR} />
        </div>
      </section>

      <section aria-labelledby="profile-heading" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 id="profile-heading" className="sr-only">Stat profiles</h2>
        <div className="mb-2 flex items-center justify-center gap-4 text-[11px] font-semibold text-zinc-400">
          <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: A_COLOR }} />{v.a.short}</span>
          <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: B_COLOR }} />{v.b.short}</span>
        </div>
        <div className="flex justify-center">
          <ZRadar players={[
            { label: v.a.short, z: avgZ(v.a.slots.map((x) => x.player)), color: A_COLOR },
            { label: v.b.short, z: avgZ(v.b.slots.map((x) => x.player)), color: B_COLOR },
          ]} />
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Each five&apos;s average era-relative profile (z-scores): descriptive, not a fit rating.
        </p>
      </section>

      <section aria-labelledby="note-heading" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 id="note-heading" className="text-sm font-black text-zinc-100">How to read this</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{fantasyNote()}</p>
        <p className="mt-2 text-sm text-zinc-400">
          <Link href="/how-it-works" className="font-semibold text-zinc-200 underline underline-offset-4 hover:text-white">How the engine works</Link>
          {" · "}
          <Link href="/teams" className="font-semibold text-zinc-200 underline underline-offset-4 hover:text-white">All-time five for every franchise</Link>
        </p>
      </section>

      <div className="mt-12 border-t border-zinc-800 pt-10 text-center">
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
          Think you can beat both? Go for <span className="text-gold">82-0</span>.
        </h2>
        <div className="mt-5 flex justify-center">
          <ButtonLink href="/play" size="lg">Draft your own five →</ButtonLink>
        </div>
      </div>

      <section aria-labelledby="more-heading" className="mt-14">
        <h2 id="more-heading" className="font-display text-2xl tracking-tight">More matchups</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {others.map((m) => (
            <li key={m.slug}>
              <Link href={vsPath(m.slug)} className="block rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100">
                {matchupShort(m)} →
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
