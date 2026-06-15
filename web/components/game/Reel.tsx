import React from "react";

export function Reel({ kind, value, sub, color, locked, masked, spinning, prime }: {
  kind: string; value: string; sub: string; color: "orange" | "violet"; locked?: boolean; masked?: boolean; spinning?: boolean; prime?: boolean;
}) {
  // Prime's era reel is fixed BY DESIGN, not a consumed re-spin — keep the reel's own violet and
  // say what it is ("ALL ERAS"), never the amber "LOCKED" used when a re-spin freezes a reel.
  const ring = prime ? "border-violet-500" : locked ? "border-amber-500" : color === "orange" ? "border-orange-500" : "border-violet-500";
  const tag = prime ? "text-violet-400" : locked ? "text-amber-400" : color === "orange" ? "text-orange-500" : "text-violet-400";
  // Settled reels glow in their accent — the slot-machine "landed" beat. Quiet while cycling.
  const glow = spinning
    ? ""
    : prime
      ? "shadow-[0_0_22px_-6px_rgba(139,92,246,0.55)]"
      : locked
        ? "shadow-[0_0_22px_-6px_rgba(245,158,11,0.55)]"
        : color === "orange"
          ? "shadow-[0_0_22px_-6px_rgba(255,106,0,0.55)]"
          : "shadow-[0_0_22px_-6px_rgba(139,92,246,0.55)]";
  return (
    <div className={`relative w-32 rounded-xl border-2 ${ring} bg-zinc-900 px-3 py-3 text-center transition-shadow sm:w-40 ${glow}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${tag}`}>{prime ? "ALL ERAS" : locked ? "🔒 LOCKED" : kind}</div>
      <div className="text-3xl font-black leading-tight sm:text-4xl">{masked ? "???" : value}</div>
      <div className="truncate text-[10px] text-zinc-500">{masked ? "hidden" : sub}</div>
      {/* announce the settled reel once (stay quiet while cycling and when the value is masked) */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{spinning || masked ? "" : `${kind}: ${value}`}</span>
    </div>
  );
}
