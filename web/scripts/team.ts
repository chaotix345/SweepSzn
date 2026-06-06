import fs from "node:fs";
import path from "node:path";
import { evaluateLineup, DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients } from "../lib/types";

const D = path.join(process.cwd(), "public", "data");
const players: Player[] = JSON.parse(fs.readFileSync(path.join(D, "players.json"), "utf-8"));
const c: Coefficients = { ...DEFAULT_COEFFICIENTS, ...JSON.parse(fs.readFileSync(path.join(D, "coefficients.json"), "utf-8")) };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function findPlayer(q: string): Player | null {
  const nq = norm(q);
  const matches = players.filter((p) => norm(p.name).includes(nq));
  if (!matches.length) return null;
  return matches.sort((a, b) => (b.peak_score ?? 0) - (a.peak_score ?? 0))[0]; // most prominent match
}

// names: comma-separated across all argv (so quoting is flexible)
const names = process.argv.slice(2).join(" ").split(",").map((s) => s.trim()).filter(Boolean);
const found: Player[] = [];
const missing: string[] = [];
for (const n of names) {
  const p = findPlayer(n);
  if (p) found.push(p); else missing.push(n);
}

if (missing.length) console.log("NOT FOUND: " + missing.join(", ") + "  (try a fuller name)");
if (!found.length) { console.log("No players resolved."); process.exit(1); }
if (found.length !== 5) console.log(`(note: ${found.length} players — engine is calibrated for a starting five)`);

const R = evaluateLineup(found, c);
console.log(`\n${R.wins}-${R.losses}   ${R.label}    ORtg ${R.ortg} / DRtg ${R.drtg} / Net ${R.netRtg > 0 ? "+" : ""}${R.netRtg}   (win% ${(R.winPct * 100).toFixed(1)})`);
console.log("");
for (const p of found) {
  const im = R.players.find((x) => x.id === p.id)!;
  console.log(`  ${p.pos.padEnd(2)} ${p.name.padEnd(22)} ${p.year} ${(p.team || "").padEnd(4)}  off ${im.off.toFixed(1).padStart(5)}  def ${im.def.toFixed(1).padStart(5)}  usg ${String(im.usage).padStart(2)}  ${p.tier !== "complete" ? "(est. D)" : ""}`);
}
console.log("\nwhy this record:");
for (const f of R.factors) console.log(`  ${f.value > 0 ? "+" : ""}${f.value}  ${f.label}`);
for (const n of R.notes) console.log("  · " + n);
