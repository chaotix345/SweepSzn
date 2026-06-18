"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// Post-reveal Drafted Dex strip: the five just fielded are saved to the user's collection. Shows the
// current collection size + a deep link to /dex (the "added to your Dex" moment). Purely descriptive /
// post-commit — a collection counter, never a fit signal (DESIGN.md §12). Renders nothing until the
// auth-gated /api/dex resolves, so it stays silent on signed-out / Redis-dark cards (RarityBadge pattern).
type View = { phase: "ok"; count: number } | { phase: "signedOut" } | null;

const STRIP =
  "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 py-2.5 text-sm font-semibold text-zinc-400 transition hover:border-orange-600/60 hover:text-orange-300";

export function DexStrip() {
  const [view, setView] = useState<View>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/dex")
      .then((r) => {
        if (r.status === 401) { if (alive) setView({ phase: "signedOut" }); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => { if (alive && d && Array.isArray(d.players)) setView({ phase: "ok", count: d.players.length }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!view) return null;
  if (view.phase === "signedOut") {
    return (
      <Link href="/dex" className={STRIP}>
        🗂️ Start your Drafted Dex — every player you field is saved · View →
      </Link>
    );
  }
  return (
    <Link href="/dex" className={STRIP}>
      🗂️ Your five joined the Dex — <strong className="text-zinc-200">{view.count}</strong> player{view.count === 1 ? "" : "s"} collected · View →
    </Link>
  );
}
