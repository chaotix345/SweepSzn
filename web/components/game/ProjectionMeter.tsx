"use client";
import React, { useEffect, useRef, useState } from "react";
import type { RosterProjection } from "@/lib/projection";

const MAX = 82;

// Count a number up to its new target; snap instantly under reduced motion (or no rAF, e.g. tests).
function useCountUp(target: number): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
    const a = from.current;
    if (reduce || a === target || typeof performance === "undefined" || typeof requestAnimationFrame === "undefined") {
      from.current = target; setV(target); return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 550;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(Math.round(a + (target - a) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

// Live projected-wins band for the roster drafted so far: floor (rest = replacement level) to
// ceiling (best five you could still draft). It converges to your real record as you fill the five.
// Wins only, no grade — gold + the grade reveal stay reserved for the result (DESIGN.md).
export function ProjectionMeter({ projection }: { projection: RosterProjection }) {
  const { floor, ceiling } = projection;
  const floorW = useCountUp(floor.wins);
  const ceilW = useCountUp(ceiling.wins);
  const lo = (floor.wins / MAX) * 100;
  const hi = (ceiling.wins / MAX) * 100;
  return (
    <div className="mx-auto mt-3 w-full max-w-sm">
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        <span>📈 Projected wins</span>
        <span className="text-zinc-500">range narrows as you draft</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-zinc-800" role="img"
        aria-label={`Projected between ${floor.wins} and ${ceiling.wins} wins from your picks so far`}>
        <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-orange-500/80 to-orange-400/40 transition-all duration-500"
          style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="tabular-nums"><span className="font-bold text-zinc-100">{floorW}</span><span className="text-zinc-500"> floor</span></span>
        <span className="tabular-nums"><span className="text-zinc-500">best case </span><span className="font-bold text-orange-400">{ceilW}</span></span>
      </div>
    </div>
  );
}
