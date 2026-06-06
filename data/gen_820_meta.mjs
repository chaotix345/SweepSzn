// One-time generator: slim 82-0 player meta (franchise + eligible positions per player-decade)
// from 82-0's players_flat.json. Output is a committed reference consumed by enrich_players.mjs.
// Source: https://firebasestorage.googleapis.com/v0/b/project-4599904239656435772.firebasestorage.app/o/players_flat.json?alt=media
import fs from "node:fs";

const SRC = process.argv[2] || "C:/tmp/820/players_flat.json";
const OUT = "C:/Dev/Active/82-0.v2/data/820_player_meta.json";
const SLOTS = new Set(["PG", "SG", "SF", "PF", "C"]);
const slug = (s) => s.toLowerCase().replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const rows = JSON.parse(fs.readFileSync(SRC, "utf8"));
const out = {}; // slug -> [ [era, team, "PG|SG"], ... ] (deduped)
for (const r of rows) {
  const k = r.baseSlug || slug(r.player);
  const pos = (r.positions || []).filter((p) => SLOTS.has(p));
  const entry = [r.era, r.team, pos.join("|")];
  (out[k] ||= []);
  if (!out[k].some((e) => e[0] === entry[0] && e[1] === entry[1] && e[2] === entry[2])) out[k].push(entry);
}
fs.writeFileSync(OUT, JSON.stringify(out));
const slugs = Object.keys(out).length;
const rowsOut = Object.values(out).reduce((a, v) => a + v.length, 0);
console.log(`wrote ${OUT}: ${slugs} players, ${rowsOut} player-decade-team rows, ${(fs.statSync(OUT).size/1024).toFixed(0)} KB`);
