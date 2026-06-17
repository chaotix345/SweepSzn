"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listResults, type ResultEntry } from "@/lib/resultHistory";
import { useSessionContext } from "@/components/SessionProvider";
import { fetchProfile } from "@/lib/account";
import { gradeColor } from "@/lib/grades";

const MODE_LABEL: Record<ResultEntry["mode"], string> = { daily: "Daily", classic: "Classic", hoopiq: "HoopIQ", challenge: "Challenge", factorhunt: "Factor Hunt", prime: "Prime", blueprint: "Blueprint", surgeon: "Surgeon" };
const gradeText = gradeColor; // single source of truth — DESIGN.md grade-color scale
const ago = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// "Your results" on the mode picker: every finished game, newest first. Challenge entries re-open the
// live creator dashboard; everything else opens its /r/ permalink. Read from localStorage after mount
// to avoid an SSR/hydration mismatch; renders nothing until then (and nothing when empty).
export default function ResultsHistory({ onOpenChallenge }: { onOpenChallenge: (challengeId: string) => void }) {
  const { user } = useSessionContext();
  const [items, setItems] = useState<ResultEntry[] | null>(null);
  // localStorage is read after mount (avoids SSR/hydration mismatch). async IIFE keeps the setState out
  // of the effect body for react-hooks/set-state-in-effect — the repo's idiom.
  useEffect(() => { (async () => { setItems(listResults()); })(); }, []);
  // Signed in: merge this account's server-side history in (so games played on another device show up
  // here too). Union by mode:encoded, newest-first; the local list already covers this device.
  useEffect(() => {
    if (!user) return;
    let on = true;
    (async () => {
      const p = await fetchProfile();
      if (!on || !p?.results?.length) return;
      setItems((local) => {
        const seen = new Set((local ?? []).map((e) => `${e.mode}:${e.encoded}`));
        const merged = [...(local ?? [])];
        for (const e of p.results) if (!seen.has(`${e.mode}:${e.encoded}`)) merged.push(e);
        return merged.sort((a, b) => b.ts - a.ts);
      });
    })();
    return () => { on = false; };
  }, [user]);
  if (!items || items.length === 0) return null;

  const Row = ({ e }: { e: ResultEntry }) => (
    <>
      <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-400">{MODE_LABEL[e.mode]}</span>
      <span className="shrink-0 tabular-nums font-bold text-zinc-100">{e.wins}-{e.losses}</span>
      <span className={`shrink-0 text-sm font-bold ${gradeText(e.grade)}`}>{e.grade}</span>
      <span className="min-w-0 flex-1 text-right text-xs text-zinc-500">{ago(e.ts)}</span>
      <span className="shrink-0 text-orange-400/80">→</span>
    </>
  );

  return (
    <div className="mx-auto mt-10 max-w-2xl border-t border-zinc-800/60 pt-8 text-left">
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">Your results</div>
      <div className="space-y-2">
        {items.slice(0, 12).map((e) => {
          const cls = "flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 transition hover:border-zinc-600";
          // surgeon entries store the /sg/ card and open the before/after permalink, not /r/
          const href = e.mode === "surgeon" ? `/sg/${e.encoded}` : `/r/${e.encoded}`;
          return e.mode === "challenge" && e.challengeId ? (
            <button key={`${e.mode}:${e.encoded}`} onClick={() => onOpenChallenge(e.challengeId!)} className={`w-full text-left ${cls}`}>
              <Row e={e} />
            </button>
          ) : (
            <Link key={`${e.mode}:${e.encoded}`} href={href} className={cls}>
              <Row e={e} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
