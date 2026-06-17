import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redis, isRedisEnabled } from "@/lib/redis";
import { getSession } from "@/lib/authServer";
import { getMetrics, sparkline, type Metrics } from "@/lib/metrics";

export const metadata: Metadata = { title: "SweepSzn · admin", robots: { index: false } };

const ADMIN_UIDS = (process.env.ADMIN_UIDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
if (ADMIN_UIDS.length === 0) console.warn("[admin] ADMIN_UIDS is empty — /admin will 404 for everyone");
const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtRate = (x: number) => fmtPct(Math.min(1, x)); // funnel rates can exceed 100% if a stage's beacon is lossy/spammed

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-zinc-400">{label}</span>
      <span className="h-3 rounded bg-emerald-500" style={{ width: `${w}%`, minWidth: value > 0 ? 2 : 0 }} />
      <span className="tabular-nums text-zinc-300">{value}</span>
    </div>
  );
}

function Funnel({ m }: { m: Metrics }) {
  const rows = [
    { label: "Plays", value: m.funnel.plays, rate: "" },
    { label: "Completed", value: m.funnel.completes, rate: fmtRate(m.rates.completion) + " of plays" },
    { label: "Shared", value: m.funnel.shares, rate: fmtRate(m.rates.shareRate) + " of completes" },
    { label: "Signed in", value: m.funnel.signins, rate: fmtRate(m.rates.capture) + " of completes" },
  ];
  const max = Math.max(m.funnel.plays, 1);
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Funnel · last {m.days.length}d</h2>
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="grow"><Bar label={r.label} value={r.value} max={max} /></div>
          <span className="w-40 shrink-0 text-right text-xs text-zinc-500">{r.rate}</span>
        </div>
      ))}
    </section>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const session = await getSession();
  if (!session || !ADMIN_UIDS.includes(session.uid)) notFound();

  if (!isRedisEnabled()) {
    return <main className="mx-auto max-w-2xl p-8 text-zinc-300">Metrics offline — Redis is not configured.</main>;
  }

  const { days } = await searchParams;
  const n = Math.min(60, Math.max(2, Number(days) || 14));
  const m = await getMetrics(redis, { days: n });

  const modeMax = Math.max(...Object.values(m.modeSplit), 1);
  const winMax = Math.max(...m.winBuckets.map(b => b.count), 1);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6 text-zinc-100">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">SweepSzn metrics</h1>
        <span className="text-xs text-zinc-500">window: {m.days[0]} → {m.days[m.days.length - 1]}</span>
      </header>

      <Funnel m={m} />

      <section className="space-y-1">
        <h2 className="text-lg font-semibold">Retention</h2>
        <p className="text-sm text-zinc-300">Next-day return (D1): <span className="font-semibold text-emerald-400">{fmtPct(m.d1)}</span>{m.d7 !== null && <> · 7-day (D7): <span className="font-semibold text-emerald-400">{fmtPct(m.d7)}</span></>}</p>
        <p className="font-mono text-xl leading-none text-emerald-400" title="DAU per day">{sparkline(m.dauByDay)}</p>
        <p className="text-xs text-zinc-500">DAU {m.dauByDay[0]} → {m.dauByDay[m.dauByDay.length - 1]} (max {Math.max(...m.dauByDay, 0)})</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Mode split (plays)</h2>
        {["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint", "surgeon"].map(k => <Bar key={k} label={k} value={m.modeSplit[k] ?? 0} max={modeMax} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Mode conversion (play → submit)</h2>
        {["daily", "challenge", "factorhunt", "blueprint", "surgeon"].map(k => {
          const plays = m.modeSplit[k] ?? 0;
          const submits = m.submitSplit[k] ?? 0;
          return (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-zinc-400">{k}</span>
              <span className="tabular-nums text-zinc-300">{submits} / {plays}</span>
              <span className="text-xs text-zinc-500">{plays > 0 ? fmtPct(submits / plays) : "—"}</span>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <p className="text-sm text-zinc-300">Daily <b>{m.boards.daily}</b> · Weekly <b>{m.boards.weekly}</b> · All-time <b>{m.boards.alltime}</b></p>
        <p className="font-mono text-xl leading-none text-sky-400" title="Daily board size per day">{sparkline(m.boardByDay)}</p>
        <h3 className="pt-2 text-sm font-semibold text-zinc-400">Today&apos;s win distribution</h3>
        {m.winBuckets.map(b => <Bar key={b.label} label={b.label} value={b.count} max={winMax} />)}
      </section>

      <section className="text-xs text-zinc-500">
        All-time events — {["play", "complete", "share", "signin", "submit"].map(k => `${k}: ${m.totals[k] ?? 0}`).join(" · ")}
      </section>
    </main>
  );
}
