import type { Metadata } from "next";
import Link from "next/link";
import ResultPreview from "@/components/ResultPreview";
import { baseUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "How SweepSzn works — the honest NBA lineup engine, explained",
  description:
    "How SweepSzn simulates an 82-game season for any all-time NBA starting five: finite possessions, usage overload, era normalization, defense at full weight, spacing and fit — calibrated to 1,170 real NBA team-seasons.",
  alternates: { canonical: "/how-it-works" },
};

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
    { "@type": "ListItem", position: 2, name: "How it works", item: `${baseUrl}/how-it-works` },
  ],
};
const breadcrumbHtml = JSON.stringify(breadcrumb).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbHtml }} />

      <p className="text-xs font-bold uppercase tracking-widest text-orange-400">How it works</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">An engine that plays real basketball</h1>
      <p className="mt-4 max-w-2xl text-base text-zinc-400">
        Most all-time lineup tools just add up box-score averages, which rewards stacking five ball-dominant
        scorers. SweepSzn doesn&apos;t. It models the things that actually decide an NBA season, then simulates
        all 82 games — and tells you, in plain English, why your five wins or loses.
      </p>

      {/* How to play */}
      <section className="mt-12">
        <h2 className="font-display text-2xl tracking-tight">Playing a round</h2>
        <ol className="mt-5 space-y-4">
          <Step n="1" title="Spin the reels">
            An orange <strong className="text-zinc-200">team</strong> reel and a violet <strong className="text-zinc-200">era</strong> reel
            land on a franchise and a decade. Lock one and re-spin the other to chase the player you want. You get one re-spin of each.
          </Step>
          <Step n="2" title="Draft your five">
            Browse that team-and-era roster and slot a player at each position — PG, SG, SF, PF, C. Eligibility is enforced
            from real position data, so five point guards is not a lineup.
          </Step>
          <Step n="3" title="Get the verdict">
            The engine simulates 82 games and returns a record, a letter grade, and a two-column breakdown of exactly what
            helped and what hurt. In Daily mode it ranks you on a server-verified leaderboard with streaks.
          </Step>
          <Step n="4" title="Share it">
            Every result gets a unique permalink and a share card. Send it, challenge a friend to the same spins, or chase
            a higher leaderboard rank.
          </Step>
        </ol>
      </section>

      {/* game modes */}
      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">Eight ways to play</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          The same engine drives every mode. Four of them are only possible because the engine explains itself —
          a tool that just prints a number can&apos;t ask you to predict a factor, grade you on one, or diagnose your worst.
        </p>
        <div className="mt-6 space-y-5">
          <Principle term="Daily">
            Everyone gets the same spins each day, ranked on a server-verified leaderboard with streaks.
          </Principle>
          <Principle term="Classic">
            Full stats visible while you draft, with a couple of optional fit hints per game.
          </Principle>
          <Principle term="HoopIQ">
            Team, era, and stats are hidden — draft the five from memory and test your ball knowledge.
          </Principle>
          <Principle term="Factor Hunt">
            Before the reveal, predict which factor matters most to your five. Nail it for a small leaderboard bonus —
            and learn the engine&apos;s vocabulary as you play.
          </Principle>
          <Principle term="Prime Draft">
            The era reel is gone. Each franchise offers its all-time pool with every player at his statistical peak,
            so you can build cross-era fives. A fantasy simulation, not a historical one.
          </Principle>
          <Principle term="Blueprint">
            Commit to a tactical objective — Spacing Bomb, Defensive Fortress, Usage Discipline, Rim Dominance, or
            Balanced — before you spin. The engine grades your execution on that axis, and each blueprint has its own board.
          </Principle>
          <Principle term="Surgeon">
            Draft your five, then the engine diagnoses its single worst factor and deals three targeted replacements.
            Make one swap to fix the weakness. Your score is the win delta, so a sharp fix on a flawed roster beats a
            lazy tweak on a great one.
          </Principle>
          <Principle term="Challenge a friend">
            Send a link with your exact spins. Your friend drafts the same teams and eras and tries to beat your record.
          </Principle>
        </div>
      </section>

      {/* live example */}
      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">A real example</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          This is a live engine result — a balanced two-way GOAT five. Even this lineup loses wins to usage overload,
          which is the whole point.
        </p>
        <div className="mt-5">
          <ResultPreview />
        </div>
      </section>

      {/* the model */}
      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">What the engine models</h2>
        <div className="mt-6 space-y-5">
          <Principle term="Finite possessions">
            There is one basketball and roughly 100 possessions a game. Five 30%-usage stars cannot all eat. The engine
            tracks every player&apos;s usage demand and docks lineups that blow the possession budget — the single biggest
            thing box-score adders get wrong.
          </Principle>
          <Principle term="Era normalization">
            Every player is z-scored against their own season&apos;s league average, so Wilt Chamberlain&apos;s pace-inflated
            1962 line isn&apos;t compared head-to-head with a modern stat. Eras are leveled before anyone is rated.
          </Principle>
          <Principle term="Defense at full weight">
            Defense carries close to equal weight with offense. Rim protection, perimeter defense, and the defensive
            glass all count — not just steals and blocks. Pre-1974 defense (before steals/blocks were tracked) is
            estimated honestly from win shares rather than guessed.
          </Principle>
          <Principle term="Spacing">
            Not enough outside shooting clogs the paint and drags down the whole offense, no matter who is on the floor.
            The engine fits a continuous spacing term from real data.
          </Principle>
          <Principle term="Fit and redundancy">
            Five creators, no rim protection, or no shooting each show up in the math. A lineup is more — and sometimes
            less — than the sum of its box scores.
          </Principle>
        </div>
      </section>

      {/* calibration */}
      <section className="mt-14 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="font-display text-2xl tracking-tight">Calibrated, not guessed</h2>
        <p className="mt-3 text-sm text-zinc-400">
          Every coefficient is fit to real history — <strong className="text-zinc-200">1,170 NBA team-seasons</strong> (1985–2025)
          across <strong className="text-zinc-200">24,687 player-seasons</strong> — not hand-tuned. Out-of-sample accuracy is
          <strong className="text-zinc-200"> 6.07 wins RMSE</strong> in year-grouped cross-validation, and wins come from a
          Pythagorean expectation (exponent k ≈ 14). The proof it&apos;s honest: stack five ball-dominant scorers and a box-score
          adder calls them historic at 74-8; SweepSzn knows one ball can&apos;t feed them all.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-800 pt-5">
          <Stat n="24,687" label="player-seasons" />
          <Stat n="1,170" label="NBA team-seasons" />
          <Stat n="6.07" label="win RMSE (out-of-sample)" />
          <Stat n="k ≈ 14" label="Pythagorean exponent" />
        </div>
      </section>

      <div className="mt-12 text-center">
        <h2 className="font-display text-3xl tracking-tight">Spin the reels. Draft your five. Go for 82-0.</h2>
        <Link
          href="/play"
          className="mt-5 inline-block rounded-xl bg-orange-500 px-8 py-3 text-base font-black text-black shadow-lg transition hover:bg-orange-400"
        >
          Build your five →
        </Link>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="font-display text-3xl leading-none text-orange-500/30">{n}</div>
      <div>
        <div className="text-sm font-black text-zinc-100">{title}</div>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{children}</p>
      </div>
    </li>
  );
}

function Principle({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-1 shrink-0 font-black text-orange-500">—</span>
      <p className="text-sm leading-relaxed text-zinc-300">
        <span className="font-semibold text-zinc-100">{term}.</span>{" "}
        <span className="text-zinc-400">{children}</span>
      </p>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <span className="text-xs text-zinc-500">
      <span className="font-mono font-black text-zinc-300">{n}</span> {label}
    </span>
  );
}
