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

// Modes that show the post-game sign-in nudge (every mode except Daily, which uses the Leaderboard's
// richer claim-your-rank prompt) — mirrors lib/signinNudge.showsSaveNudge.
const NUDGE_MODES = ["classic", "hoopiq", "prime", "factorhunt", "blueprint", "surgeon", "challenge"];

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
    { label: "Visitors", value: m.funnel.visits, rate: "" },
    { label: "First play", value: m.funnel.firstPlays, rate: fmtRate(m.rates.firstPlay) + " of visitors" },
    { label: "Plays", value: m.funnel.plays, rate: "incl. replays" },
    { label: "Completed", value: m.funnel.completes, rate: fmtRate(m.rates.completion) + " of plays" },
    { label: "Shared", value: m.funnel.shares, rate: fmtRate(m.rates.shareRate) + " of completes (incl. reshares)" },
    { label: "Signed in", value: m.funnel.signins, rate: fmtRate(m.rates.capture) + " of completes" },
  ];
  const max = Math.max(m.funnel.visits, m.funnel.plays, 1);
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
  const eng = m.engagement;
  const engRows = [
    { label: "Share views", value: eng.shareViews },
    { label: "Explore open", value: eng.exploreOpen },
    { label: "What-If open", value: eng.whatifOpen },
    { label: "Compare open", value: eng.compareOpen },
    { label: "Compare friend", value: eng.compareFriend },
    { label: "Nudge shown", value: eng.claimNudgeShown },
    { label: "Nudge tap", value: eng.claimNudgeTap },
  ];
  const engMax = Math.max(...engRows.map(r => r.value), 1);
  // acquisition channels seen in the window, ordered by the conversions that matter (first-plays)
  const sources = Array.from(new Set([...Object.keys(m.sourceSplit.firstPlay), ...Object.keys(m.sourceSplit.visit)]))
    .sort((a, b) => (m.sourceSplit.firstPlay[b] ?? 0) - (m.sourceSplit.firstPlay[a] ?? 0));

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6 text-zinc-100">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">SweepSzn metrics</h1>
        <span className="text-xs text-zinc-500">window: {m.days[0]} → {m.days[m.days.length - 1]}</span>
      </header>

      <Funnel m={m} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Engagement &amp; share loop</h2>
        {engRows.map(r => <Bar key={r.label} label={r.label} value={r.value} max={engMax} />)}
        <p className="text-xs text-zinc-500">Share views = shared /r/·/pe/ links opened (the loop closing). Compare friend = the viral mechanic. Nudge = the post-game sign-in moment on non-Daily results.</p>
      </section>

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
        <h2 className="text-lg font-semibold">Sign-in nudge by mode (shown → tap)</h2>
        {NUDGE_MODES.map(k => {
          const shown = m.nudgeSplit.shown[k] ?? 0;
          const taps = m.nudgeSplit.tap[k] ?? 0;
          return (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-zinc-400">{k}</span>
              <span className="tabular-nums text-zinc-300">{taps} / {shown}</span>
              <span className="text-xs text-zinc-500">{shown > 0 ? fmtPct(taps / shown) : "—"} tap rate</span>
            </div>
          );
        })}
        <p className="text-xs text-zinc-500">Did the post-game nudge earn the tap? Tap rate = claim_nudge_tap ÷ claim_nudge_shown for that mode (Daily excluded — it uses the Leaderboard prompt).</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Acquisition by source (utm_source)</h2>
        {sources.length === 0 ? (
          <p className="text-xs text-zinc-500">No tagged traffic yet — append <code>?utm_source=&lt;channel&gt;</code> to launch links (e.g. <code>/play?mode=daily&amp;utm_source=x_launch</code>).</p>
        ) : sources.map(s => {
          const v = m.sourceSplit.visit[s] ?? 0;
          const fp = m.sourceSplit.firstPlay[s] ?? 0;
          return (
            <div key={s} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 truncate text-zinc-400" title={s}>{s}</span>
              <span className="tabular-nums text-zinc-300">{fp} first-plays / {v} visits</span>
              <span className="text-xs text-zinc-500">{v > 0 ? fmtPct(fp / v) : "—"} conv</span>
            </div>
          );
        })}
        <p className="text-xs text-zinc-500">First-play by acquisition channel — which post/link converted a new player. Conv = first-plays ÷ visits for that source.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <p className="text-sm text-zinc-300">Daily <b>{m.boards.daily}</b> · Weekly <b>{m.boards.weekly}</b> · All-time <b>{m.boards.alltime}</b></p>
        <p className="font-mono text-xl leading-none text-sky-400" title="Daily board size per day">{sparkline(m.boardByDay)}</p>
        <h3 className="pt-2 text-sm font-semibold text-zinc-400">Today&apos;s win distribution</h3>
        {m.winBuckets.map(b => <Bar key={b.label} label={b.label} value={b.count} max={winMax} />)}
      </section>

      <section className="text-xs text-zinc-500">
        All-time events — {["visit", "first_play", "play", "complete", "share", "share_view", "signin", "submit", "explore_open", "whatif_open", "compare_open", "compare_friend", "claim_nudge_shown", "claim_nudge_tap"].map(k => `${k}: ${m.totals[k] ?? 0}`).join(" · ")}
      </section>
    </main>
  );
}
