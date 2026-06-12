// Server component (NO "use client"): the home page landing / positioning section.
// Pure static, crawlable HTML — converts the cold, mostly-mobile inbound from the share loop
// + Daily leaderboard. Copy is rendered via {expressions} so apostrophes/quotes don't trip the
// react/no-unescaped-entities lint rule. CTAs link to /play.
// (No "Modes" section here — the /play mode picker covers that; the Daily leaderboard hook is
// folded into the "Get graded" step instead.)
import Link from "next/link";
import ResultPreview from "./ResultPreview";

export default function LandingSection() {
  return (
    <div className="bg-zinc-950 text-zinc-100">
      {/* ── Section 1: Hero ───────────────────────────────────────────── */}
      <section className="px-5 pt-12 pb-8 text-center sm:px-8 sm:pt-16">
        <div className="font-display text-3xl tracking-tight sm:text-4xl">
          Sweep<span className="text-orange-500">Szn</span>
        </div>
        <h1 className="mx-auto mt-4 max-w-2xl font-display text-4xl tracking-tight sm:text-5xl">
          Can you go 82-0?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400">
          {"Draft an all-time NBA starting five — spin a team reel and an era reel, pick your five, and let the engine find every hole in your lineup. Nobody has gone 82-0. The best five ever found projects 80-2."}
        </p>
        <div className="mt-6 flex justify-center">
          <a
            href="/play"
            className="rounded-xl bg-orange-500 px-7 py-3 text-base font-black text-black shadow-lg transition hover:bg-orange-400"
          >
            Build your five →
          </a>
        </div>
        <div className="mx-auto mt-8 max-w-lg">
          <ResultPreview />
        </div>
      </section>

      {/* ── Section 2: Contrast (naive vs. engine) ────────────────────── */}
      <section className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        <div className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-zinc-500">
          Why it matters
        </div>
        <p className="mx-auto mb-6 max-w-xl text-center text-sm text-zinc-400">
          {"Most all-time lineup builders just add up box-score averages. That gets it backwards."}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* naive box-score sum (strawman — NOT our engine) */}
          <div className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">Box-score sum</div>
            <div className="mt-0.5 text-[11px] italic text-zinc-500">rewards five ball-dominant scorers</div>
            <div className="mt-3 font-display text-5xl tabular-nums text-red-400">74<span className="text-zinc-600">–</span>8</div>
            <p className="mt-3 text-xs text-zinc-400">
              {"Five 30%-usage stars, one basketball — on paper it never breaks down."}
            </p>
            <p className="mt-2 text-sm font-black text-red-400">{"That's backwards."}</p>
          </div>
          {/* our engine (live output for the hero five) */}
          <div className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 ring-1 ring-orange-500/20">
            <div className="text-xs font-bold uppercase tracking-wide text-orange-400">SweepSzn engine</div>
            <div className="mt-0.5 text-[11px] italic text-zinc-500">rewards a balanced two-way five</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl tabular-nums text-green-400">78<span className="text-zinc-600">–</span>4</span>
              <span className="rounded-full bg-green-400/10 px-2 py-0.5 text-xs font-black text-green-400">A+ HISTORIC</span>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              {"Curry, Jordan, LeBron, Giannis, Jokić — and it still docks them −13.2 for usage overload."}
            </p>
            <p className="mt-2 text-sm font-semibold text-green-400">The engine gets it right.</p>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center text-sm text-zinc-400">
          {"One basketball can't feed five ball-dominant stars. Our engine knows that. A box-score adder doesn't."}
        </p>
      </section>

      {/* ── Section 3: How it works ───────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-6 text-xs font-bold uppercase tracking-widest text-zinc-500">How to play</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          <Step n="1" title="Spin the reels">
            {"An orange TEAM reel and a violet ERA reel land on a franchise and decade. Lock one and re-spin the other to hunt the player you want."}
          </Step>
          <Step n="2" title="Draft your five">
            {"Browse that era's roster and slot a player at each position — PG, SG, SF, PF, C. Eligibility is enforced: five point guards is not a lineup."}
          </Step>
          <Step n="3" title="Get graded">
            {"The engine simulates all 82 games and returns a record, a letter grade, and a plain-English breakdown of what helped and what hurt — and in Daily mode, ranks you on a server-verified leaderboard."}
          </Step>
        </div>
      </section>

      {/* ── Section 4: The engine (credibility) ───────────────────────── */}
      <section className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          What the engine actually models
        </div>
        <h2 className="mt-2 font-display text-2xl text-zinc-100">An engine that plays real basketball</h2>
        <p className="mt-3 text-sm text-zinc-400">
          {"SweepSzn is fit to 1,170 real NBA team-seasons — not hand-tuned. It tracks finite possessions, era-normalizes every player, gives defense equal weight with offense, and scores spacing and fit. The result punishes exactly the lineups a box-score adder adores — the difference between a 74-win team and a 40-win one."}
        </p>
        <Link href="/how-it-works" className="mt-5 inline-block text-sm font-bold text-orange-400 hover:text-orange-300">
          See exactly how the engine works →
        </Link>
      </section>

      {/* ── Section 5: Final CTA ──────────────────────────────────────── */}
      <section className="mx-auto max-w-md px-5 pt-6 pb-4 text-center sm:px-8">
        <h2 className="font-display text-3xl text-zinc-100">Spin the reels. Draft your five. Go for 82-0.</h2>
        <a
          href="/play"
          className="mt-5 inline-block rounded-xl bg-orange-500 px-8 py-3 text-base font-black text-black shadow-lg transition hover:bg-orange-400"
        >
          Build your five →
        </a>
        <p className="mt-3 text-xs text-zinc-500">
          {"No account needed. Runs in your browser. Daily mode resets every 24 hours."}
        </p>
      </section>

    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="text-4xl font-black leading-none text-orange-500/20">{n}</div>
      <div className="mt-1 text-sm font-black text-zinc-100">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{children}</p>
    </div>
  );
}

