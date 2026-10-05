import { describe, it, expect } from "vitest";
import * as indexPage from "@/app/(site)/teams/page";
import * as teamPage from "@/app/(site)/teams/[team]/page";
import { FRANCHISES } from "@/lib/teams";
import { franchiseMetadata, teamsIndexMetadata } from "@/lib/franchise";

// Wiring for the programmatic-SEO franchise pages: static generation over exactly the 30 franchises
// (unknown slugs 404 via dynamicParams=false), per-page metadata.
describe("/teams index page", () => {
  it("exports the index metadata (title, canonical, siteName)", () => {
    const md = indexPage.metadata;
    expect(md).toEqual(teamsIndexMetadata());
    expect(md.alternates?.canonical).toBe("/teams");
    expect((md.openGraph as { siteName?: string }).siteName).toBe("SweepSzn");
    expect(String(md.title)).toMatch(/every NBA franchise/i);
  });
});

describe("/teams/[team] page", () => {
  it("statically generates exactly the 30 lowercase franchise slugs and 404s the rest", async () => {
    const params = await teamPage.generateStaticParams();
    expect(params).toHaveLength(30);
    expect(params.map((p) => p.team).sort()).toEqual(FRANCHISES.map((t) => t.toLowerCase()).sort());
    expect(teamPage.dynamicParams).toBe(false);
  });

  it("builds per-team metadata (title, canonical, siteName)", async () => {
    const md = await teamPage.generateMetadata({ params: Promise.resolve({ team: "chi" }) });
    expect(md).toEqual(franchiseMetadata("CHI"));
    expect(String(md.title)).toContain("All-time Chicago Bulls starting five");
    expect(md.alternates?.canonical).toBe("/teams/chi");
    expect((md.openGraph as { siteName?: string }).siteName).toBe("SweepSzn");
  });

  it("returns empty metadata for an unknown slug (the page itself 404s)", async () => {
    expect(await teamPage.generateMetadata({ params: Promise.resolve({ team: "xyz" }) })).toEqual({});
  });
});
