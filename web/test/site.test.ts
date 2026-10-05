import { describe, it, expect } from "vitest";
import { X_HANDLE, X_URL, SITE_NAME } from "@/lib/site";

// Single source of truth for the brand's X handle/URL — consolidated so a handle change is one edit
// (previously hardcoded across the root layout, 8 permalink twitter blocks, 3 share-text builders,
// the footer, and the JSON-LD sameAs).
describe("site brand constants", () => {
  it("exposes the canonical X handle", () => {
    expect(X_HANDLE).toBe("@SweepSeason");
  });

  it("exposes the canonical X profile URL", () => {
    expect(X_URL).toBe("https://x.com/SweepSeason");
  });

  it("the handle is the @-prefixed form of the URL's path segment", () => {
    expect(X_HANDLE).toBe("@" + X_URL.split("/").pop());
  });

  it("keeps the existing site name", () => {
    expect(SITE_NAME).toBe("SweepSzn");
  });
});

// Any route that declares itself canonical is indexable content and must be in the sitemap
// (/dex shipped with a canonical + marketing metadata but was never listed).
describe("sitemap", () => {
  it("lists every page that declares an alternates.canonical", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sitemap = (await import("@/app/sitemap")).default;
    const { baseUrl } = await import("@/lib/site");
    const listed = new Set(sitemap().map((e) => e.url.slice(baseUrl.length) || "/"));
    const canon: string[] = [];
    const walk = (dir: string) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, d.name);
        if (d.isDirectory()) walk(p);
        else if (/^(page|layout)\.tsx$/.test(d.name)) {
          const m = /canonical:\s*"([^"]+)"/.exec(readFileSync(p, "utf-8"));
          if (m) canon.push(m[1]);
        }
      }
    };
    walk(join(process.cwd(), "app"));
    expect(canon).toContain("/dex");
    for (const c of canon) expect(listed, c).toContain(c);
  });
});
