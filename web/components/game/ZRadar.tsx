import React from "react";
import { polygonPoints, axisPoint, zRadius } from "@/lib/radar";
import type { ZScores } from "@/lib/types";

// Shared z-score radar (pentagon). Plots one or two players' league-relative standing across five
// descriptive axes. The shape says how dominant a player was for his era — NOT how he fits a lineup —
// so it is safe to show pre-pick (DESIGN.md §12). Reused by Compare and (later) the Dossier.

type Z = Pick<ZScores, "pts" | "trb" | "ast" | "stl" | "blk" | "ts">;
export interface RadarPlayer { label: string; z?: Z; color: string }

const AXES = ["SCORE", "REB", "PLAY", "DEF", "EFF"];
const SIZE = 200;
const C = SIZE / 2;

// Per-axis z: Defense averages steals + blocks (0/estimated pre-1974); Efficiency is the TS% z-score.
function axisZ(z?: Z): number[] {
  const v = (x?: number | null) => (typeof x === "number" ? x : 0);
  const def = (v(z?.stl) + v(z?.blk)) / 2;
  return [v(z?.pts), v(z?.trb), v(z?.ast), def, v(z?.ts)];
}

export function ZRadar({ players }: { players: RadarPlayer[] }) {
  return (
    <svg viewBox="-22 -22 244 244" width="208" height="208" role="img"
      aria-label={`Stat radar for ${players.map((p) => p.label).join(" and ")}`}>
      <polygon points={polygonPoints([1, 1, 1, 1, 1], SIZE)} fill="none" stroke="#3f3f46" strokeWidth={1} />
      <polygon points={polygonPoints([0.5, 0.5, 0.5, 0.5, 0.5], SIZE)} fill="none" stroke="#27272a" strokeWidth={1} />
      {AXES.map((_, i) => {
        const [x, y] = axisPoint(i, AXES.length, 1, SIZE);
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#27272a" strokeWidth={1} />;
      })}
      {players.map((p, pi) => (
        <polygon key={p.label + pi} points={polygonPoints(axisZ(p.z).map(zRadius), SIZE)}
          fill={p.color} fillOpacity={0.16} stroke={p.color} strokeWidth={2}
          strokeDasharray={pi === 1 ? "4 3" : undefined} />
      ))}
      {AXES.map((ax, i) => {
        const [x, y] = axisPoint(i, AXES.length, 1.16, SIZE);
        return <text key={ax} x={x} y={y} fontSize={9} fill="#71717a" textAnchor="middle" dominantBaseline="middle">{ax}</text>;
      })}
    </svg>
  );
}
