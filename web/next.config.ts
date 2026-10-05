import type { NextConfig } from "next";

// Runtime readers of public/data (fs.readFileSync at request time, lazily on first use):
//   lib/data.ts          -> players.json, coefficients.json
//   lib/leagueContext.ts -> league_context.json (imported by data.ts, so every data.ts importer)
//   lib/playerMeta.ts    -> accolades.json (player dossier)
//   lib/teamLookup.ts    -> team_lookup.json (no app importer today)
//   /api/health          -> stats players.json (deploy canary: `data`)
// Serverless hosts don't ship public/ inside a function unless it's traced. Next's tracer does follow
// these path.join(process.cwd(), "public", "data", …) reads and includes public/data for every
// function that imports a reader (verified in .next/server/**/*.nft.json); this list force-includes
// the same files as belt-and-braces, so a tracer change can't ship "game deploys but loads zero
// players". It covers every DYNAMIC route/page that reaches a reader — directly or via
// lib/verifyDeps, lib/sharedLineup, lib/challengeStore, lib/dex… — including the share pages and
// their OG cards, which render per request (ƒ), not at build. Only the ○ static pages (/, /about,
// /how-it-works) read data at build and need no entry. test/nextConfig.test.ts walks the import graph
// and fails naming any reader route this misses. Routes that never reach a reader stay lean.
// Keys are picomatch globs matched (contains) against the route path, values are project-root globs.
const DATA_FILES = [
  "./public/data/players.json",
  "./public/data/coefficients.json",
  "./public/data/league_context.json",
  "./public/data/accolades.json",
];
const DATA_ROUTES = [
  "/api/evaluate",
  "/api/spin",
  "/api/project",
  "/api/swap-options",
  "/api/player/**",
  "/api/result/**",
  "/api/crowd",
  "/api/slot-pick", // validates beacon personIds against the real pool (lib/data getPersonName)
  "/api/dex",
  "/api/profile/sync",
  "/api/health",
  "/api/daily/submit",
  "/api/blueprint/submit",
  "/api/factorhunt/submit",
  "/api/factorhunt/choices",
  "/api/surgeon/submit",
  "/api/surgeon/pool",
  "/api/challenge/**", // submit + [id] + [id]/board + [id]/results (lib/challengeStore imports data.ts)
  "/r/**", "/pe/**", "/sg/**", "/c/**", "/dex/s/**", "/compare/**", // share pages + OG cards
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: Object.fromEntries(DATA_ROUTES.map((r) => [r, DATA_FILES])),
};

export default nextConfig;
