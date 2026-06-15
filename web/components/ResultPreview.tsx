// Server component (NO "use client"): renders a real, pre-evaluated example result as static,
// crawlable HTML for the landing hero. Reuses the exact engine + explanation path the live
// /r/[lineup] page uses, so the numbers are the real product output — not a mock. Mirrors the
// "Why this record" markup from ResultCard.tsx without the client-only roster/share UI.
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { factorViews } from "@/lib/explain";
import { GRADE_COLOR } from "@/lib/grades";

// A balanced two-way GOAT five (slot order PG/SG/SF/PF/C). Verified output: 78-4, A+ HISTORIC,
// Net +23.4 — Star offense/defense/Spacing help; Usage overload (-13.2) hurts even this lineup,
// which is the whole pitch. Rendered live so it self-corrects if coefficients.json is recalibrated.
const HERO_IDS = [
  "stephen_curry_gsw_2010s_2016",
  "michael_jordan_chi_1990s_1991",
  "lebron_james_mia_2010s_2013",
  "giannis_antetokounmpo_mil_2020s_2022",
  "nikola_joki_den_2020s_2024",
];


export default function ResultPreview({ reveal = false }: { reveal?: boolean } = {}) {
  const players = getPlayersByIds(HERO_IDS);
  const result = evaluateLineup(players, getCoefficients());
  const factors = factorViews(result);
  const helps = factors.filter((f) => f.value > 0);
  const hurts = factors.filter((f) => f.value < 0);
  const gradeColor = GRADE_COLOR[result.grade] ?? "text-zinc-300";

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 ring-1 ring-gold/20 ${reveal ? "animate-gold-pulse" : ""}`}
      style={{ boxShadow: "0 0 60px 0 rgba(255,197,61,0.32)" }}
    >
      {/* record hero */}
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 pt-6 pb-5 text-center">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          example result · projected record
        </div>
        <div className={`mt-1 font-display text-8xl tabular-nums sm:text-9xl ${gradeColor} ${reveal ? "animate-record-slam" : ""}`}>
          {result.wins}<span className="text-zinc-600">–</span>{result.losses}
        </div>
        <div className="mt-1 text-lg font-bold tracking-wide">
          <span className={gradeColor}>{result.grade}</span>{" "}
          <span className="text-zinc-300">{result.label}</span>
        </div>
        <div className="mt-4 flex justify-center gap-2 text-sm">
          <Metric label="ORtg" value={result.ortg.toFixed(1)} />
          <Metric label="DRtg" value={result.drtg.toFixed(1)} />
          <Metric
            label="Net"
            value={`${result.netRtg > 0 ? "+" : ""}${result.netRtg.toFixed(1)}`}
            color={result.netRtg >= 0 ? "text-green-400" : "text-red-400"}
          />
        </div>
      </div>

      {/* why this record */}
      <div className="border-t border-zinc-800 px-6 py-5">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Why this record</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FactorColumn title="What's helping" items={helps} kind="good" />
          <FactorColumn title="What's hurting" items={hurts} kind="bad" />
        </div>
        <p className="mt-4 text-center text-xs font-semibold text-orange-400">
          No other version explains why your five wins or loses.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, color = "text-zinc-200" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/60 px-3 py-1.5">
      <span className="text-zinc-500">{label} </span><b className={`tabular-nums ${color}`}>{value}</b>
    </div>
  );
}

function FactorColumn({ title, items, kind }: { title: string; items: ReturnType<typeof factorViews>; kind: "good" | "bad" }) {
  const color = kind === "good" ? "text-green-400" : "text-red-400";
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold text-zinc-500">{title}</div>
      {items.length === 0 && (
        <div className="text-xs text-zinc-500">{kind === "bad" ? "No major weaknesses — a clean, balanced build." : "—"}</div>
      )}
      <div className="space-y-2">
        {items.map((f, i) => (
          <div key={i}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-zinc-300">{f.label}</span>
              <span className={`shrink-0 tabular-nums font-semibold ${color}`}>{f.value > 0 ? "+" : ""}{f.value.toFixed(1)}</span>
            </div>
            <div className="text-[11px] leading-snug text-zinc-500">{f.blurb}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
