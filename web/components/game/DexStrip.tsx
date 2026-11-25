"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchDex } from "@/lib/dexClient";

// Post-reveal Drafted Dex strip: the five just fielded are saved to the user's collection. Shows the
// current collection size + a deep link to /dex (the "added to your Dex" moment). Purely descriptive /
// post-commit — a collection counter, never a fit signal (DESIGN.md §12). Local-first: the Dex is built
// from this device's history (plus the account when signed in), so it's true signed out too. Renders
// nothing until /api/dex resolves, and stays silent if it fails (RarityBadge pattern).
const STRIP =
  "mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-center text-sm font-semibold text-zinc-400 transition hover:border-orange-600/60 hover:text-orange-300";

// lineupIds = the five just fielded. We union them into the count so the strip is accurate even before
// the result lands in local history / the account sync — otherwise the count could lag by up to 5.
export function DexStrip({ lineupIds = [] }: { lineupIds?: string[] }) {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchDex().then((d) => { if (alive && d) setIds(d.players.map((p) => p.id)); });
    return () => { alive = false; };
  }, []);

  if (!ids) return null;
  const count = new Set([...ids, ...lineupIds]).size;
  return (
    <Link href="/dex" className={STRIP}>
      🗂️ Your five joined the Dex — <strong className="text-zinc-200">{count}</strong> player{count === 1 ? "" : "s"} collected · View →
    </Link>
  );
}
