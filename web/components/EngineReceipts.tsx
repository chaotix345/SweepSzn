// Server component: the public accuracy receipts on /how-it-works (DESIGN.md §14). Every number is
// computed from the committed data and the live engine at build time — nothing here is hand-typed,
// so it cannot drift from what the game actually scores. The engine's best possible five is
// deliberately NOT shown (it would spoil the chase).
import { getLatestPlayers, getCoefficients, getPlayersByIds } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { getEngineMeta, getFamousTeams, topCards } from "@/lib/receipts";
import { STRESS_PANEL } from "@/lib/stressPanel";

const f1 = (x: number | undefined) => (x == null ? "–" : x.toFixed(1));
const yr = (y: number) => `'${String(y).slice(2)}`;

export default function EngineReceipts() {
  const c = getCoefficients();
  const meta = getEngineMeta();
  const famous = getFamousTeams();
  const players = getLatestPlayers();
  const top = topCards(players, c, "total", 10);
  const defenders = topCards(players, c, "def", 10);
  const panel = STRESS_PANEL.map((l) => {
    const five = getPlayersByIds(l.ids);
    return { ...l, five, result: five.length === 5 ? evaluateLineup(five, c) : null };
  });

  return (
    <section id="receipts" className="mt-14 scroll-mt-20">
      <h2 className="font-display text-2xl tracking-tight">The receipts</h2>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">
        Don&apos;t take the engine&apos;s word for it. Everything below is computed from the same data and model
        that grade your draft.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Receipt n={f1(meta.cv_wins_rmse)} label="wins off, on average, predicting real teams from their players' actual seasons" />
        <Receipt n={f1(meta.track_b_cv)} label="wins off when each player is rated only from his OTHER seasons — the honest test of the card ratings" />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Both are out-of-sample: whole seasons are held out, the model is fit on the rest, and the held-out teams are
        predicted cold ({meta.team_seasons?.toLocaleString()} real team-seasons, 1985–2025, measured against luck-adjusted
        win totals). The second number is higher because it is harder: the card ratings never see the season they are
        graded on.
      </p>

      <h3 className="mt-10 text-sm font-black uppercase tracking-wide text-zinc-300">Famous teams</h3>
      <p className="mt-2 text-xs text-zinc-500">
        Each team&apos;s real top five by minutes. &quot;Engine&quot; uses the same card ratings the game uses; &quot;Cold&quot;
        rates every player only from his other seasons. Both run through the model with the starting five alone, so
        great benches and coaching don&apos;t show up, and the best teams come in under their real record.
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-[11px] uppercase tracking-wide text-zinc-500">
            <tr><th className="px-3 py-2">Team</th><th className="px-3 py-2 text-right">Engine</th><th className="px-3 py-2 text-right">Cold</th><th className="px-3 py-2 text-right">Actual</th></tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {famous.map((t) => (
              <tr key={t.label} className="border-t border-zinc-800">
                <td className="px-3 py-2 font-sans text-zinc-300">{t.label}</td>
                <td className="px-3 py-2 text-right text-zinc-100">{t.predicted_wins}-{82 - t.predicted_wins}</td>
                <td className="px-3 py-2 text-right text-zinc-400">{t.cold_wins}-{82 - t.cold_wins}</td>
                <td className="px-3 py-2 text-right text-zinc-400">{t.actual_wins}-{t.actual_losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-10 text-sm font-black uppercase tracking-wide text-zinc-300">Stress tests</h3>
      <p className="mt-2 text-xs text-zinc-500">
        Lineups no real team would field, run straight through the engine (most can&apos;t be drafted). The penalties
        for these builds are judgment calls, so here is exactly what the engine charges each one.
      </p>
      <div className="mt-3 space-y-2">
        {panel.map((l) => l.result && (
          <div key={l.key} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-zinc-100">{l.publicName}</span>
              <span className="font-mono text-lg font-black tabular-nums text-zinc-100">{l.result.wins}-{l.result.losses}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{l.five.map((p) => `${p.name} ${yr(p.year)}`).join(" · ")}</div>
            <div className="mt-1 text-xs text-zinc-400">
              {l.result.factors.filter((f) => f.value < 0).map((f) => `${f.label.replace(/\s*\(.*\)\s*$/, "")} ${f.value.toFixed(1)}`).join(" · ") || "No fit penalties"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <TopList title="Top 10 players" rows={top.map((r) => ({ id: r.id, name: `${r.name} ${yr(r.year)}`, v: r.total }))} />
        <TopList title="Top 10 defenders" rows={defenders.map((r) => ({ id: r.id, name: `${r.name} ${yr(r.year)}`, v: r.def }))} />
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Points per 100 possessions above an average player, best card per player. Cards are rated from the seasons around
        them and weighted by minutes, so one lucky year or a 24-minute specialist role can&apos;t pass for all-time greatness.
      </p>

      <h3 className="mt-10 text-sm font-black uppercase tracking-wide text-zinc-300">Fitted vs. reasoned</h3>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs font-bold text-green-400">Fitted to real NBA teams</div>
          <p className="mt-1.5 text-zinc-400">How player impact turns into team offense and defense, the Pythagorean win curve
            (exponent ≈ {meta.pythK ? Math.round(meta.pythK) : 14}), the spacing term, how much each season counts toward a card,
            and the usage range real starting fives live in.</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs font-bold text-orange-400">Reasoned, not fitted</div>
          <p className="mt-1.5 text-zinc-400">The era discount and the penalties for lineups real teams never field: too many
            ball-dominant scorers, nobody to create a shot, no big man, no perimeter stopper. Real teams never go there, so the
            data can&apos;t size these. They&apos;re set by basketball reasoning and are zero for real NBA lineups.</p>
        </div>
      </div>
    </section>
  );
}

function Receipt({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <div className="font-mono text-3xl font-black tabular-nums text-zinc-100">{n}</div>
      <div className="mt-1 text-xs leading-snug text-zinc-500">{label}</div>
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: { id: string; name: string; v: number }[] }) {
  return (
    <div>
      <div className="text-sm font-black uppercase tracking-wide text-zinc-300">{title}</div>
      <ol className="mt-2 space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.id} className="flex justify-between gap-3 border-b border-zinc-900 py-1">
            <span className="text-zinc-300"><span className="mr-2 font-mono text-zinc-600">{i + 1}</span>{r.name}</span>
            <span className="font-mono tabular-nums text-zinc-400">{r.v.toFixed(1)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
