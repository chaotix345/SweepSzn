import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "@/app/(site)/page";
import HowItWorks from "@/app/(site)/how-it-works/page";
import About from "@/app/(site)/about/page";
import TeamsIndex from "@/app/(site)/teams/page";
import VsIndex from "@/app/(site)/vs/page";
import VsPage from "@/app/(site)/vs/[slug]/page";
import robots from "@/app/robots";
import { bestFiveAnswer, perfectSeasonAnswer, recordAnswer, bullsWarriorsAnswer } from "@/lib/answers";
import { franchiseJsonLdHtml } from "@/lib/franchise";
import { getEngineMeta } from "@/lib/receipts";
import { VS_MATCHUPS } from "@/lib/vs";

type Node = Record<string, unknown>;

// Pull every JSON-LD block out of rendered page HTML and parse it.
function jsonLd(html: string): Node[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
const nodes = (blocks: Node[]): Node[] => blocks.flatMap((b) => (Array.isArray(b["@graph"]) ? (b["@graph"] as Node[]) : [b]));
const ofType = (blocks: Node[], t: string) => nodes(blocks).filter((n) => n["@type"] === t);

// Structural checks for the schema.org types we emit (what Google's Rich Results test enforces).
function validate(blocks: Node[]) {
  expect(blocks.length).toBeGreaterThan(0);
  const text = JSON.stringify(blocks);
  // no fabricated social proof anywhere
  expect(text).not.toMatch(/aggregateRating|"review"|ratingValue/i);
  for (const b of blocks) expect(b["@context"]).toBe("https://schema.org");
  for (const n of nodes(blocks)) {
    expect(typeof n["@type"], JSON.stringify(n).slice(0, 80)).toBe("string");
    if (n["@type"] === "FAQPage") {
      const qs = n.mainEntity as Node[];
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) {
        expect(q["@type"]).toBe("Question");
        expect(String(q.name).length).toBeGreaterThan(5);
        const a = q.acceptedAnswer as Node;
        expect(a["@type"]).toBe("Answer");
        expect(String(a.text).length).toBeGreaterThan(20);
      }
    }
    if (n["@type"] === "ItemList" || n["@type"] === "BreadcrumbList") {
      const items = n.itemListElement as Node[];
      expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1));
      if (n.numberOfItems != null) expect(n.numberOfItems).toBe(items.length);
      for (const i of items) expect(i["@type"]).toBe("ListItem");
    }
    if (n["@type"] === "BreadcrumbList") {
      for (const i of n.itemListElement as Node[]) expect(String(i.item)).toMatch(/^https?:\/\//);
    }
  }
}

describe("JSON-LD structured data", () => {
  it("home: WebSite + free WebApplication", () => {
    const ld = jsonLd(renderToStaticMarkup(Home()));
    validate(ld);
    expect(ofType(ld, "WebSite")).toHaveLength(1);
    const app = ofType(ld, "WebApplication")[0];
    expect(app.applicationCategory).toBe("GameApplication");
    expect(app.offers).toMatchObject({ price: "0" });
  });

  it("how-it-works: breadcrumb + FAQPage carrying the straight answers", () => {
    const html = renderToStaticMarkup(HowItWorks());
    const ld = jsonLd(html);
    validate(ld);
    expect(ofType(ld, "BreadcrumbList")).toHaveLength(1);
    const qs = (ofType(ld, "FAQPage")[0].mainEntity as Node[]).map((q) => q.name);
    expect(qs).toEqual(expect.arrayContaining([
      "What is the best all-time NBA starting five?", "Can a team go 82-0?", "How does SweepSzn calculate a lineup's record?",
    ]));
    // the FAQ is visible to humans too, and links to the matchups
    expect(html).toContain("Straight answers");
    expect(html).toContain('href="/vs"');
  });

  it("about: FAQPage", () => {
    const ld = jsonLd(renderToStaticMarkup(About()));
    validate(ld);
    const qs = (ofType(ld, "FAQPage")[0].mainEntity as Node[]).map((q) => q.name);
    expect(qs).toContain("Can a team go 82-0?");
    expect(qs).toContain("What is the best all-time NBA starting five?");
  });

  it("teams: ItemList on the index (linking to /vs), SportsTeam + ItemList per franchise", () => {
    const html = renderToStaticMarkup(TeamsIndex());
    validate(jsonLd(html));
    expect(html).toContain('href="/vs"');
    const team = [JSON.parse(franchiseJsonLdHtml("CHI")!)];
    validate(team);
    expect(ofType(team, "SportsTeam")[0]).toMatchObject({ name: "Chicago Bulls", sport: "Basketball" });
    expect(ofType(team, "ItemList")[0].numberOfItems).toBe(5);
  });

  it("vs: index ItemList and per-matchup page JSON-LD", async () => {
    validate(jsonLd(renderToStaticMarkup(VsIndex())));
    const slug = VS_MATCHUPS[0].slug;
    const html = renderToStaticMarkup(await VsPage({ params: Promise.resolve({ slug }) }));
    validate(jsonLd(html));
    expect(html).toContain("fantasy sim");
    expect(html).toContain('href="/play"');
  });
});

describe("direct answers", () => {
  it("lead with the answer and use the engine's real numbers", () => {
    const m = getEngineMeta();
    expect(perfectSeasonAnswer().a).toMatch(/^No real NBA team has\. The best record in NBA history is 73-9/);
    expect(bestFiveAnswer().a).toMatch(/projects 80-2/);
    expect(bestFiveAnswer().a).toMatch(/project \d+-\d+/);
    expect(recordAnswer().a).toContain(`${m.team_seasons.toLocaleString("en-US")} real NBA team-seasons`);
    expect(recordAnswer().a).toContain(`about ${m.cv_wins_rmse.toFixed(1)} wins`);
    expect(bullsWarriorsAnswer()!.a).toMatch(/1995-96 Bulls starting five at \d+-\d+/);
  });
});

describe("robots", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  const ua = (u: string) => rules.find((x) => (Array.isArray(x.userAgent) ? x.userAgent : [x.userAgent]).includes(u));

  it("allows AI search crawlers on public pages by name", () => {
    for (const bot of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      expect(ua(bot)?.allow, bot).toBe("/");
    }
  });

  it("keeps /admin and the API disallowed for every group", () => {
    for (const rule of rules) expect(rule.disallow).toEqual(expect.arrayContaining(["/admin", "/api/"]));
    expect(ua("*")?.allow).toBe("/");
  });
});
