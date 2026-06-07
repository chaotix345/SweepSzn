import fs from "node:fs";
import path from "node:path";
import { playerImpact, DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients } from "../lib/types";

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const coeff: Coefficients = { ...DEFAULT_COEFFICIENTS, ...JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8")) };

const rated = players.map((p) => {
  const im = playerImpact(p, coeff);
  return { p, ...im, total: im.off + im.def };
});

// keep only each real person's best variant so the all-time list reads one-row-per-player
const pid = (p: Player) => p.person_id ?? p.id;
function bestPerPerson<T extends { p: Player }>(arr: T[], key: (x: T) => number): T[] {
  const best = new Map<string, T>();
  for (const x of arr) { const k = pid(x.p); if (!best.has(k) || key(x) > key(best.get(k)!)) best.set(k, x); }
  return [...best.values()];
}

console.log("=== TOP 25 BY TOTAL IMPACT (off+def, pts/100 vs avg; best season per player) ===");
bestPerPerson(rated, (r) => r.total).sort((a, b) => b.total - a.total).slice(0, 25).forEach((r, i) =>
  console.log(`${String(i + 1).padStart(2)}. ${r.p.name.padEnd(22)} ${r.p.year} ${r.p.pos.padEnd(2)} off ${String(r.off).padStart(5)} def ${String(r.def).padStart(5)} tot ${r.total.toFixed(1).padStart(5)} ${r.p.tier === "complete" ? "" : "(est.D)"}`));

console.log("\n=== TOP 10 DEFENDERS (best season per player) ===");
bestPerPerson(rated, (r) => r.def).sort((a, b) => b.def - a.def).slice(0, 10).forEach((r) =>
  console.log(`  ${r.p.name.padEnd(22)} ${r.p.year} ${r.p.pos} def ${r.def} ${r.p.tier !== "complete" ? "(est.)" : ""}`));
