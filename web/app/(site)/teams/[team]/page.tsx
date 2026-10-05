import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import {
  franchiseAllTimeFive, franchiseFormerly, franchiseFromSlug, franchiseFullName, franchiseHeadline,
  franchiseJsonLdHtml, franchiseLegends, franchiseMetadata, franchiseStaticParams, type FranchisePlayer,
} from "@/lib/franchise";
import { gradeColor } from "@/lib/grades";
import { teamColors, teamName } from "@/lib/teams";

type Props = { params: Promise<{ team: string }> };

// The 30 franchises are prerendered at build; any other slug 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return franchiseStaticParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const team = franchiseFromSlug((await params).team);
  return (team && franchiseMetadata(team)) || {};
}

const stat = (v: number | null) => (v == null ? "—" : v.toFixed(1));

function StatLine({ p }: { p: FranchisePlayer }) {
  return (
    <span className="font-mono text-xs tabular-nums text-zinc-300">
      {stat(p.pts)} PTS · {stat(p.trb)} REB · {stat(p.ast)} AST
    </span>
  );
}

export default async function TeamPage({ params }: Props) {
  const team = franchiseFromSlug((await params).team);
  if (!team) notFound();

  const five = franchiseAllTimeFive(team);
  const legends = franchiseLegends(team) ?? [];
  const nick = teamName(team);
  const formerly = franchiseFormerly(team);
  const c = teamColors(team);
  const span = legends.length > 1 ? `the ${legends[0].decade} to the ${legends[legends.length - 1].decade}` : `the ${legends[0]?.decade ?? "years"}`;
  const grade = five ? gradeColor(five.record.grade) : "";
  const jsonLd = franchiseJsonLdHtml(team);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}

      <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
        <Link href="/teams" className="hover:text-zinc-300">Teams</Link>
        <span aria-hidden className="mx-1.5">/</span>
        <span className="text-zinc-400">{franchiseFullName(team)}</span>
      </nav>

      <div className="mt-4 flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-black"
          style={{ background: c.bg, color: c.text }}
        >
          {team}
        </span>
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">All-time five</p>
      </div>
      <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">{franchiseHeadline(team)}</h1>
      <p className="mt-4 max-w-2xl text-base text-zinc-400">
        The best {nick} at every position, drawn from {span} of franchise history — and what the SweepSzn engine
        makes of them as one starting five.
        {formerly && <> Includes the franchise&apos;s years as the {formerly}.</>}
      </p>

      {five ? (
        <section aria-labelledby="five-heading" className="mt-10">
          <h2 id="five-heading" className="sr-only">The starting five</h2>
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {five.slots.map(({ slot, player: p }) => (
              <li key={p.id} className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <span
                  className="self-start rounded-md px-2 py-0.5 text-[11px] font-black tracking-wide"
                  style={{ background: c.bg, color: c.text }}
                >
                  {slot}
                </span>
                <span className="mt-2 font-bold leading-tight text-zinc-100">{p.name}</span>
                <span className="mt-0.5 text-xs text-zinc-500">{p.season} · {p.decade}</span>
                <dl className="mt-3 grid grid-cols-3 gap-1 text-center">
                  {([["PTS", p.pts], ["REB", p.trb], ["AST", p.ast]] as const).map(([label, v]) => (
                    <div key={label} className="flex flex-col-reverse rounded-md bg-zinc-950/60 py-1">
                      <dt className="text-[10px] font-semibold tracking-wide text-zinc-500">{label}</dt>
                      <dd className="font-mono text-sm font-bold tabular-nums text-zinc-100">{stat(v)}</dd>
                    </div>
                  ))}
                </dl>
                {p.accolades && <span className="mt-2 text-xs leading-snug text-zinc-400">{p.accolades}</span>}
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Projected record</div>
              <div className={`mt-1 font-display text-6xl tabular-nums ${grade}`}>
                {five.record.wins}<span className="text-zinc-600">–</span>{five.record.losses}
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                The SweepSzn engine projects this five at{" "}
                <strong className="text-zinc-200">{five.record.wins}-{five.record.losses}</strong>{" "}
                (<span className={`font-bold ${grade}`}>{five.record.grade}</span> {five.record.label.toLowerCase()}).
              </p>
            </div>
            <ButtonLink href={five.href} variant="secondary">See the full breakdown →</ButtonLink>
          </div>

          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-zinc-500">
            How this five was picked: by career accolades, one per position. Players are ranked by All-Star selections
            plus MVP, All-NBA and All-Defense voting, weighted toward what they did for the {nick}, with full-time
            starters (30+ minutes a night) first. Each position goes to the best-ranked player who can play it, one
            season per player — no engine optimizing.{" "}
            <Link href="/how-it-works" className="underline underline-offset-2 hover:text-zinc-300">How the engine works</Link>.
          </p>
        </section>
      ) : null}

      {legends.length > 0 && (
        <section aria-labelledby="legends-heading" className="mt-14">
          <h2 id="legends-heading" className="font-display text-3xl tracking-tight">Legends by decade</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            The most decorated {nick} of each era, each shown in his best season with the franchise that decade.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {legends.map((d) => (
              <div key={d.decade} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <h3 className="font-display text-xl tracking-wide text-zinc-100">{d.decade}</h3>
                <ol className="mt-3 divide-y divide-zinc-800">
                  {d.players.map((p) => (
                    <li key={p.id} className="py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-semibold text-zinc-100">{p.name}</span>
                        <span className="text-xs text-zinc-500">{p.season} · {p.positions.join("/")}</span>
                      </div>
                      <div className="mt-0.5"><StatLine p={p} /></div>
                      {p.accolades && <div className="mt-0.5 text-xs text-zinc-400">{p.accolades}</div>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-14 border-t border-zinc-800 pt-10 text-center">
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
          Think you can beat the all-time {nick}? Go for <span className="text-gold">82-0</span>.
        </h2>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/play" size="lg">Draft your own five →</ButtonLink>
          <ButtonLink href="/teams" size="lg" variant="secondary">All 30 franchises</ButtonLink>
        </div>
      </div>
    </div>
  );
}
