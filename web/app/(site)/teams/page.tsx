import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { franchiseIndex, teamsIndexJsonLdHtml, teamsIndexMetadata } from "@/lib/franchise";
import { gradeColor } from "@/lib/grades";
import { displayName, teamColors } from "@/lib/teams";

export const metadata: Metadata = teamsIndexMetadata();

export default function TeamsIndex() {
  const teams = franchiseIndex();
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: teamsIndexJsonLdHtml() }} />

      <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Franchises</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">All-time starting fives for every NBA franchise</h1>
      <p className="mt-4 max-w-2xl text-base text-zinc-400">
        Thirty franchises, one all-time five each — built only from players who suited up for that team, picked by
        career accolades, one per position. Then the SweepSzn engine plays each five over a full 82-game season.
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => {
          const c = teamColors(t.team);
          const grade = t.five ? gradeColor(t.five.record.grade) : "";
          return (
            <li key={t.team}>
              <Link
                href={t.path}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:border-zinc-600"
              >
                <div aria-hidden className="h-1.5" style={{ background: c.bg }} />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                      style={{ background: c.bg, color: c.text }}
                    >
                      {t.team}
                    </span>
                    <span className="font-bold text-zinc-100">{t.name}</span>
                  </div>
                  {t.five ? (
                    <>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className={`font-display text-3xl tabular-nums ${grade}`}>
                          {t.five.record.wins}<span className="text-zinc-600">–</span>{t.five.record.losses}
                        </span>
                        <span className={`text-sm font-bold ${grade}`}>{t.five.record.grade}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                        {t.five.slots.map((s) => displayName(s.player.name)).join(" · ")}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-zinc-400">Legends by decade</p>
                  )}
                  <span className="mt-auto pt-3 text-xs font-semibold text-zinc-500 transition group-hover:text-zinc-300">
                    See the five →
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="mt-14 max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="font-display text-2xl tracking-tight">How these were picked</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Every player is ranked by career accolades — All-Star selections plus MVP, All-NBA and All-Defense voting —
          weighted toward what he did for that franchise, with full-time starters (30+ minutes a night) ahead of short
          stints. Each position then goes to the best-ranked player who can play it, one season per player. No engine
          optimizing, no hand-picking.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          The record is the engine&apos;s honest verdict on that exact five — the same one you&apos;d get drafting it
          yourself. Curious why some legendary fives fall short?{" "}
          <Link href="/how-it-works" className="font-semibold text-zinc-200 underline underline-offset-4 hover:text-white">
            See how the engine works
          </Link>
          .
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
