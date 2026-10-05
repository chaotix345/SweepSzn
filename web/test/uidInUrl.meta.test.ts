// Meta-test (DESIGN.md §12 "Don't ship anon UIDs in URLs or logs"): the anon uid is a bearer token,
// so no client code may put a uid in a query string — URLs land in server/CDN logs (and board GETs
// are CDN-cached by URL). Personalized reads POST the uid in the JSON body instead. Scans every
// non-test source under components/ and lib/ (code lines only, comments skipped).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("no uid in client URLs", () => {
  it("no fetch URL (or any other code string) in components/ or lib/ carries a uid= query param", () => {
    const hits: string[] = [];
    for (const dir of ["components", "lib"]) {
      for (const file of sources(path.join(ROOT, dir))) {
        fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
          const code = line.trim();
          if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
          if (/[?&]uid=/.test(code)) hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${code}`);
        });
      }
    }
    expect(hits, `uid in a URL (POST it in the body instead):\n${hits.join("\n")}`).toEqual([]);
  });
});
