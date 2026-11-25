import fs from "node:fs";
import path from "node:path";
import { historyPaceFrom } from "../lib/historyPercentile";

// Regenerates lib/historyPace.json (the compact sorted win-pace array the history percentile reads)
// from public/data/team_lookup.json. test/historyPercentile.test.ts fails if the two drift.
// Run from web/: npx tsx scripts/emit_history_pace.ts
const lookup = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "team_lookup.json"), "utf-8"));
const out = path.join(process.cwd(), "lib", "historyPace.json");
fs.writeFileSync(out, JSON.stringify(historyPaceFrom(Object.values(lookup))) + "\n");
console.log(`wrote ${out}`);
