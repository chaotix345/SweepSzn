// Meta-test: next.config.ts force-traces public/data into every serverless function that reads it at
// runtime. Walk the import graph from each app entry (page/route/OG) and fail, naming the entry, if
// one reaches a runtime data reader but no outputFileTracingIncludes key covers the files it reads.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import nextConfig from "@/next.config";

// Next matches keys with its bundled picomatch ({ dot, contains }) against the route path.
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (glob: string, opts?: object) => (s: string) => boolean;

const ROOT = process.cwd();
const READERS: Record<string, string[]> = {
  "lib/data.ts": ["players.json", "coefficients.json"],
  "lib/leagueContext.ts": ["league_context.json"],
  "lib/playerMeta.ts": ["accolades.json"],
  "lib/teamLookup.ts": ["team_lookup.json"],
  "app/api/health/route.ts": ["players.json"], // the deploy canary stats players.json itself
};
// ○ static in the build route table — prerendered at build (data read then), so no server trace.
const STATIC = new Set(["/", "/about", "/how-it-works"]);

const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join("/");
function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, ...[".ts", ".tsx"].map((e) => base + e), ...[".ts", ".tsx"].map((e) => path.join(base, "index" + e))]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
const IMPORT_RE = /(?:import|export)\s[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
function readsOf(entry: string): Set<string> {
  const files = new Set<string>(), seen = new Set<string>(), stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const r of READERS[rel(f)] ?? []) files.add(r);
    for (const m of fs.readFileSync(f, "utf-8").matchAll(IMPORT_RE)) {
      const d = resolve(f, m[1] ?? m[2] ?? m[3]);
      if (d) stack.push(d);
    }
  }
  return files;
}
function entries(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) entries(p, out);
    else if (/^(page|route|opengraph-image|layout)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
// app/(site)/r/[x]/page.tsx -> /r/[x]; .../opengraph-image.tsx -> /.../opengraph-image
const routeOf = (abs: string) =>
  "/" + rel(abs).replace(/^app\/?/, "").replace(/(^|\/)\([^)]+\)/g, "").replace(/\/?(page|route|layout)\.tsx?$/, "").replace(/\.tsx?$/, "").replace(/^\//, "");

describe("next.config outputFileTracingIncludes covers every runtime public/data reader", () => {
  const includes = nextConfig.outputFileTracingIncludes ?? {};
  const covered = (route: string) => Object.entries(includes)
    .filter(([key]) => picomatch(key, { dot: true, contains: true })(route))
    .flatMap(([, globs]) => globs);

  it("each dynamic entry that reads public/data has those files force-traced", () => {
    const missing: string[] = [];
    let readers = 0;
    for (const e of entries(path.join(ROOT, "app"))) {
      const route = routeOf(e);
      const reads = readsOf(e);
      if (!reads.size || STATIC.has(route)) continue;
      readers++;
      const globs = covered(route);
      for (const f of reads) {
        if (!globs.some((g) => picomatch(g.replace(/^\.\//, ""))(`public/data/${f}`))) missing.push(`${route} (${rel(e)}) needs public/data/${f}`);
      }
    }
    expect(readers).toBeGreaterThan(20);
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("routes that never touch public/data stay lean (no players.json)", () => {
    for (const route of ["/api/board/weekly", "/api/auth/me", "/api/pickem", "/rank/[card]"]) {
      expect(covered(route), route).toEqual([]);
    }
  });
});
