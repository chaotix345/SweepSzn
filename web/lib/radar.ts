// Pure SVG geometry for the z-score radar (pentagon by default). Maps per-axis z-scores to polygon
// points in a square viewBox. The shape is descriptive — how a player compares to his era — and says
// nothing about lineup fit, so it is safe to show pre-pick (DESIGN.md §12 trust model).

// Map a z-score to a 0..1 radius fraction: anchored at the league mean (z <= 0 -> 0), clamped at
// z = 3.5 (the same anchor the era bars use in lib/era.ts).
export function zRadius(z: number | null | undefined): number {
  if (z == null || Number.isNaN(z)) return 0;
  return Math.max(0, Math.min(z / 3.5, 1));
}

// Cartesian point for axis `i` of `n`, at `radiusFrac` of the way out, in a square of side `size`.
// Axis 0 sits at the top (12 o'clock); axes proceed clockwise.
export function axisPoint(i: number, n: number, radiusFrac: number, size: number): [number, number] {
  const c = size / 2;
  const r = radiusFrac * c;
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [c + r * Math.cos(angle), c + r * Math.sin(angle)];
}

// SVG polygon `points` string ("x,y x,y …") for the given per-axis radius fractions.
export function polygonPoints(fracs: number[], size: number): string {
  return fracs
    .map((f, i) => axisPoint(i, fracs.length, f, size).map((v) => Math.round(v * 10) / 10).join(","))
    .join(" ");
}
