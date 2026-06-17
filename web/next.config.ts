import type { NextConfig } from "next";

// Exactly these 10 /api route handlers read players.json + coefficients.json from disk at runtime
// via lib/data.ts — the SOLE runtime reader of public/data, reached either directly or transitively
// through lib/verifyDeps. Serverless hosts don't bundle public/ into a function by default, and
// Next's static tracer can't follow data.ts's dynamic fs.readFileSync(path.join(DATA_DIR, file)),
// so the files must be force-traced into precisely those functions ("game deploys but loads zero
// players" otherwise). The other ~24 /api routes never import data.ts, so narrowing from the old
// "/api/**" glob drops the 4.1 MB players.json from their bundles (faster cold starts under launch
// load). The /r, /pe, /sg pages also use data.ts but render statically (read at build), so they
// need no entry. league_context.json is offline/build-only and never read at runtime — excluded.
const DATA_FILES = ["./public/data/players.json", "./public/data/coefficients.json"];
const DATA_ROUTES = [
  "/api/evaluate",
  "/api/spin",
  "/api/project",
  "/api/daily/submit",
  "/api/blueprint/submit",
  "/api/factorhunt/submit",
  "/api/factorhunt/choices",
  "/api/surgeon/submit",
  "/api/surgeon/pool",
  "/api/challenge/**", // submit + [id] + [id]/board + [id]/results all reach data.ts (results resolves lineups)
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: Object.fromEntries(DATA_ROUTES.map((r) => [r, DATA_FILES])),
};

export default nextConfig;
