import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { resolveSharedLineup, type SharedLineup } from "@/lib/sharedLineup";
import { fmtNet } from "@/lib/explain";
import { avgZ } from "@/lib/radar";
import { ZRadar } from "@/components/game/ZRadar";
import { displayName } from "@/lib/teams";
import { GRADE_COLOR } from "@/lib/grades";
import ShareHeader from "@/components/ShareHeader";

type Props = { params: Promise<{ id1: string; id2: string }> };

const A_COLOR = "#ff6a00";
const B_COLOR = "#38bdf8";

// Two shared lineup segments, decoded + re-evaluated (resolveSharedLineup) and rendered head to head:
// both records, a shared z-radar, and the per-100 ratings. Descriptive/post-commit — every lineup here
// is already locked and scored, so full transparency is fair (DESIGN.md §12). cache() dedupes the
// decode+evaluate across generateMetadata and the render.
const load = cache((a: string, b: string): { left: SharedLineup; right: SharedLineup } | null => {
  const left = resolveSharedLineup(a);
  const right = resolveSharedLineup(b);
  return left && right ? { left, right } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id1, id2 } = await params;
  const data = load(id1, id2);
  if (!data) return { title: "SweepSzn — lineup compare", robots: { index: false } };
  const { left, right } = data;
  const title = `${left.result.wins}-${left.result.losses} vs ${right.result.wins}-${right.result.losses} — SweepSzn compare`;
  const description = `Two all-time fives head to head: ${left.result.wins}-${left.result.losses} (${left.result.grade}) vs ${right.result.wins}-${right.result.losses} (${right.result.grade}). Build your own and see how it stacks up.`;
  return {
    title, description, robots: { index: false },
    openGraph: { title, description, type: "website", url: `/compare/${id1}/${id2}` },
    twitter: { card: "summary_large_image", title, description, site: "@SweepSeason", creator: "@SweepSeason" },
  };
}

function Side({ data, color, tag }: { data: SharedLineup; color: string; tag: string }) {
  const { result, players } = data;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />{tag}
      </div>
      <div className="mt-1 font-display text-4xl tabular-nums" style={{ color }}>
        {result.wins}<span className="text-zinc-600">–</span>{result.losses}
      </div>
      <div className={`text-sm font-bold ${GRADE_COLOR[result.grade] ?? "text-zinc-300"}`}>{result.grade} · {result.label}</div>
      <ul className="mt-2 space-y-0.5 text-xs text-zinc-400">
        {players.map((p) => (
          <li key={p.id} className="truncate">{displayName(p.name)} <span className="text-zinc-600">· {p.team}</span></li>
        ))}
      </ul>
      <div className="mt-2 flex gap-3 border-t border-zinc-800 pt-2 text-[11px] tabular-nums text-zinc-400">
        <span>ORtg <b className="text-zinc-200">{result.ortg.toFixed(1)}</b></span>
        <span>DRtg <b className="text-zinc-200">{result.drtg.toFixed(1)}</b></span>
        <span>Net <b className={result.netRtg >= 0 ? "text-green-400" : "text-red-400"}>{fmtNet(result.netRtg)}</b></span>
      </div>
    </div>
  );
}

export default async function ComparePage({ params }: Props) {
  const { id1, id2 } = await params;
  const data = load(id1, id2);
  if (!data) notFound();
  const { left, right } = data;
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ShareHeader tagline="lineup compare" cta="Build your own →" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Side data={left} color={A_COLOR} tag="Five A" />
          <Side data={right} color={B_COLOR} tag="Five B" />
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-center justify-center gap-4 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5 text-zinc-400"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: A_COLOR }} />Five A</span>
            <span className="flex items-center gap-1.5 text-zinc-400"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: B_COLOR }} />Five B</span>
          </div>
          <div className="flex justify-center">
            <ZRadar players={[
              { label: "Five A", z: avgZ(left.players), color: A_COLOR },
              { label: "Five B", z: avgZ(right.players), color: B_COLOR },
            ]} />
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-600">
            Each five&apos;s collective era-relative profile (z-scores) across five axes — descriptive, not a fit rating.
          </p>
        </div>
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">engine calibrated to real NBA team-seasons</footer>
    </main>
  );
}
