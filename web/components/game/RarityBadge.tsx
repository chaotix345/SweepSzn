"use client";
import { useEffect, useState } from "react";

// Post-commit social proof: what fraction of players built this exact five. Hidden until there's
// enough volume to be meaningful (the route gates it). Rarity is orthogonal to quality — the copy
// states a fact and never implies "rare = good" (DESIGN.md §12). Neutral violet mark, not gold.
export function RarityBadge({ ids }: { ids: string }) {
  const [pct, setPct] = useState<number | null>(null);
  useEffect(() => {
    if (ids.split(",").length !== 5) return;
    let alive = true;
    fetch(`/api/rarity?ids=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.rarity) setPct(d.rarity.pct); })
      .catch(() => {});
    return () => { alive = false; };
  }, [ids]);

  if (pct == null) return null;
  return (
    <p className="mt-2 text-xs text-zinc-400">
      <span className="text-violet-300" aria-hidden>◆</span> Only <strong className="text-zinc-200">{pct}%</strong> of players have built this exact core.
    </p>
  );
}
