"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listResults, type ResultEntry } from "@/lib/resultHistory";
import { getHistory } from "@/lib/streak";
import { useSessionContext } from "@/components/SessionProvider";
import { fetchProfile } from "@/lib/account";
import { gradeColor, gradeHex } from "@/lib/grades";
import { computeStats, mergeResults, resultHref, withAccountStreak } from "@/lib/stats";
import { ButtonLink } from "@/components/ui/Button";

// "My Stats" (/stats): the player's own progress at a glance — descriptive aggregates over their
// finished games (DESIGN.md §12). All math lives in lib/stats; this only reads + renders.

const MODE_LABEL: Record<ResultEntry["mode"], string> = { daily: "Daily", classic: "Classic", hoopiq: "HoopIQ", challenge: "Challenge", factorhunt: "Factor Hunt", prime: "Prime", blueprint: "Blueprint", surgeon: "Surgeon" };
const LABEL = "text-[11px] font-bold uppercase tracking-widest text-zinc-500";

const Tile = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
    <dt className={LABEL}>{label}</dt>
    <dd className="mt-1">{children}</dd>
  </div>
);
const Days = ({ n }: { n: number }) => (
  <><span className="font-display text-4xl leading-none text-zinc-100">{n}</span> <span className="text-xs text-zinc-500">{n === 1 ? "day" : "days"}</span></>
);
const WL = ({ e }: { e: ResultEntry }) => (
  <><span className="tabular-nums">{e.wins}-{e.losses}</span> <span className={`font-bold ${gradeColor(e.grade)}`}>{e.grade}</span></>
);

export default function StatsBoard() {
  const { user, loading } = useSessionContext();
  const [local, setLocal] = useState<{ items: ResultEntry[]; dates: string[]; now: number } | null>(null);
  const [account, setAccount] = useState<{ results: ResultEntry[]; streak: number } | null>(null);
  // localStorage is read after mount (avoids SSR/hydration mismatch). async IIFE keeps the setState out
  // of the effect body for react-hooks/set-state-in-effect — the repo's idiom.
  useEffect(() => { (async () => { setLocal({ items: listResults(), dates: getHistory(), now: Date.now() }); })(); }, []);
  // Signed in: pull the account's server history + streak so games from other devices count too.
  useEffect(() => {
    if (!user) return;
    let on = true;
    (async () => {
      const p = await fetchProfile();
      if (on) setAccount({ results: Array.isArray(p?.results) ? p.results : [], streak: p?.streak ?? 0 });
    })();
    return () => { on = false; };
  }, [user]);

  const s = useMemo(() => {
    if (!local) return null;
    const merged = user && account ? mergeResults(local.items, account.results) : local.items;
    const stats = computeStats(merged, local.dates, local.now);
    return user && account ? withAccountStreak(stats, account.streak) : stats;
  }, [local, account, user]);

  if (!s || (s.total === 0 && (loading || (user && !account)))) {
    return <p className="py-16 text-center text-sm text-zinc-500">Loading your stats…</p>;
  }

  if (s.total === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-display text-4xl">Your stats</h1>
        <p className="mx-auto mt-2 max-w-sm text-zinc-400">No games yet. Finish one and your records, grades and Daily streak show up here.</p>
        <ButtonLink href="/play" className="mt-6">Play →</ButtonLink>
      </div>
    );
  }

  const graded = s.grades.filter((g) => g.count > 0);
  const gradedTotal = graded.reduce((n, g) => n + g.count, 0);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none">Your stats</h1>
          <p className="mt-1 text-sm text-zinc-500">{`${s.last7Days} ${s.last7Days === 1 ? "game" : "games"} in the last 7 days`}</p>
        </div>
        <ButtonLink href="/play" size="sm">Play →</ButtonLink>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Games played"><span className="font-display text-4xl leading-none text-zinc-100">{s.total}</span></Tile>
        <Tile label="Best record">
          {s.best && (
            <>
              <Link href={resultHref(s.best)} className="font-display text-4xl leading-none text-zinc-100 transition hover:text-white">
                <WL e={s.best} />
              </Link>
              <span className="mt-1 block text-xs text-zinc-500">{MODE_LABEL[s.best.mode]}</span>
            </>
          )}
        </Tile>
        <Tile label="Daily streak"><Days n={s.currentStreak} /></Tile>
        <Tile label="Best Daily streak"><Days n={s.bestStreak} /></Tile>
      </dl>

      <section aria-labelledby="stats-by-mode" className="mt-8">
        <h2 id="stats-by-mode" className={LABEL}>By mode</h2>
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3">
          <table className="w-full text-left text-sm">
            <thead className={LABEL}>
              <tr>
                <th scope="col" className="py-2 font-bold">Mode</th>
                <th scope="col" className="py-2 text-right font-bold">Played</th>
                <th scope="col" className="py-2 pl-4 font-bold">Best</th>
                <th scope="col" className="py-2 text-right font-bold">Avg W</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {s.modes.map((m) => (
                <tr key={m.mode} className={`border-t border-zinc-800/60 ${m.played ? "" : "text-zinc-600"}`}>
                  <th scope="row" className={`py-2.5 font-sans font-bold ${m.played ? "text-zinc-200" : ""}`}>{MODE_LABEL[m.mode]}</th>
                  <td className="py-2.5 text-right tabular-nums">{m.played}</td>
                  <td className="py-2.5 pl-4">
                    {m.best ? (
                      <Link href={resultHref(m.best)} className="text-zinc-100 underline-offset-4 transition hover:underline">
                        <WL e={m.best} />
                      </Link>
                    ) : (
                      <><span aria-hidden="true">—</span><span className="sr-only">none</span></>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {m.avgWins !== null ? m.avgWins.toFixed(1) : <><span aria-hidden="true">—</span><span className="sr-only">none</span></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="stats-grades" className="mt-8">
        <h2 id="stats-grades" className={LABEL}>Grades</h2>
        <div role="img" aria-label={`Grade distribution: ${graded.map((g) => `${g.grade} ${g.count}`).join(", ") || "no graded games"}`}
          className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full">
          {graded.map((g) => (
            <div key={g.grade} style={{ width: `${(g.count / gradedTotal) * 100}%`, backgroundColor: gradeHex(g.grade) }} />
          ))}
        </div>
        <ul aria-label="Grade counts" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {s.grades.map((g) => (
            <li key={g.grade} className={g.count ? "" : "opacity-40"}>
              <span className={`font-bold ${gradeColor(g.grade)}`}>{g.grade}</span>{" "}
              <span className="font-mono tabular-nums text-zinc-300">{g.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
