import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { encodeLineup } from "@/lib/share";
import { encodePickemCard } from "@/lib/pickem";
import { encodeSurgeonCard } from "@/lib/surgeon";
import { encodeDexShare } from "@/lib/share";
import { encodeRankCard } from "@/lib/rankShare";
import { encodeDuelCard } from "@/lib/duel";
import { enableRedisEnv, freshFake, ctx } from "@/test/routeHarness";
import { SITE_NAME } from "@/lib/site";

// Share permalinks (/r, /pe, …) + their dynamic OG cards. Pages/OG handlers are plain async
// functions; lib/og's element builders are spied so the OG tests can assert what gets rendered
// without running satori.
vi.mock("@/lib/og", async (orig) => {
  const actual = await orig<typeof import("@/lib/og")>();
  return { ...actual, resultOgElement: vi.fn(actual.resultOgElement), brandOgElement: vi.fn(actual.brandOgElement) };
});
vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
enableRedisEnv();
const og = await import("@/lib/og");
const ResultCard = (await import("@/components/ResultCard")).default;

const FIVE = [
  "michael_jordan_chi_1980s_1988",
  "lebron_james_cle_2000s_2009",
  "david_robinson_sas_1990s_1994",
  "nikola_joki_den_2020s_2024",
  "kevin_garnett_min_2000s_2004",
];
const VIEW = { y: 7, n: 3, vote: "y" as const };
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

// depth-first search of a server-component element tree for the first element of `type`
function findProps(node: unknown, type: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findProps(n, type); if (f) return f; } return null; }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === type) return el.props;
  return findProps(el.props?.children, type);
}

const BOT5 = ["magic_johnson_lal_1980s_1990", "larry_bird_bos_1980s_1985", "hakeem_olajuwon_hou_1990s_1993", "tim_duncan_sas_2000s_2002", "stephen_curry_gsw_2010s_2016"];
const DUEL = encodeDuelCard("analyst", FIVE, BOT5);

const MJS = ["michael_jordan_chi_1980s_1988", "michael_jordan_chi_1990s_1991", "michael_jordan_was_2000s_2003"];

beforeEach(() => { freshFake(); vi.mocked(og.resultOgElement).mockClear(); vi.mocked(og.brandOgElement).mockClear(); });

describe("/r/[lineup] OG — one person per five", () => {
  it("three eras of one player fall back to the brand card", async () => {
    const Image = (await import("@/app/r/[lineup]/opengraph-image")).default;
    await Image(params({ lineup: encodeLineup([...MJS, FIVE[2], FIVE[3]]) }));
    expect(og.resultOgElement).not.toHaveBeenCalled();
    expect(og.brandOgElement).toHaveBeenCalled();
  });
});

describe("/pe/[card] — Pick'Em share keeps the Blueprint / Prime stamps", () => {
  const pe = () => import("@/app/pe/[card]/page");
  const peOg = () => import("@/app/pe/[card]/opengraph-image");
  const bpCard = encodePickemCard(encodeLineup(FIVE, false, false, "s"), VIEW);
  const primeCard = encodePickemCard(encodeLineup(FIVE, false, true), VIEW);

  it("metadata title names Blueprint / Prime like /r does", async () => {
    const { generateMetadata } = await pe();
    expect(String((await generateMetadata(params({ card: bpCard }))).title)).toMatch(/Blueprint/);
    expect(String((await generateMetadata(params({ card: primeCard }))).title)).toMatch(/Prime/);
  });

  it("page passes blueprint / prime through to the ResultCard", async () => {
    const Page = (await pe()).default;
    const bp = findProps(await Page(params({ card: bpCard })), ResultCard)!;
    expect(bp.blueprint).toMatchObject({ key: "spacing" });
    expect(bp.pickem).toEqual(VIEW);
    const pr = findProps(await Page(params({ card: primeCard })), ResultCard)!;
    expect(pr.prime).toBe(true);
  });

  it("OG card renders the blueprint grade / PRIME badge", async () => {
    const Image = (await peOg()).default;
    await Image(params({ card: bpCard }));
    const bpArgs = vi.mocked(og.resultOgElement).mock.calls[0];
    expect(bpArgs[3]).toEqual(VIEW);
    expect(bpArgs[5]).toMatchObject({ label: expect.any(String), grade: expect.any(String) });
    await Image(params({ card: primeCard }));
    expect(vi.mocked(og.resultOgElement).mock.calls[1][4]).toBe(true);
  });
});

// Every unfurl used to re-render (ImageResponse defaults to max-age=0, must-revalidate): cold start +
// players.json parse + satori. URL-determined cards are CDN-cacheable — success AND brand fallback.
describe("dynamic OG cards are CDN-cacheable", () => {
  const sMaxAge = (res: Response) => Number(/s-maxage=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 0);
  type OgImage = (a: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const cases: [string, () => Promise<{ default: unknown }>, Record<string, string>, Record<string, string>][] = [
    ["/r", () => import("@/app/r/[lineup]/opengraph-image"), { lineup: encodeLineup(FIVE) }, { lineup: "nope" }],
    ["/pe", () => import("@/app/pe/[card]/opengraph-image"), { card: encodePickemCard(encodeLineup(FIVE), VIEW) }, { card: "nope" }],
    ["/sg", () => import("@/app/sg/[card]/opengraph-image"), { card: encodeSurgeonCard(FIVE.slice(0, 4).concat("shaquille_o_neal_lal_2000s_2001"), 4, FIVE[4]) }, { card: "nope" }],
    ["/dex/s", () => import("@/app/dex/s/[card]/opengraph-image"), { card: encodeDexShare(FIVE, 40, 3) }, { card: "nope" }],
    ["/duel", () => import("@/app/duel/[card]/opengraph-image"), { card: DUEL }, { card: "nope" }],
    ["/rank", () => import("@/app/rank/[card]/opengraph-image"), { card: encodeRankCard({ scope: "daily", rank: 3, total: 50, name: "Sam", wins: 60, losses: 22, net: 8.1 }) }, { card: "nope" }],
    ["/compare", () => import("@/app/compare/[id1]/[id2]/opengraph-image"), { id1: encodeLineup(FIVE), id2: encodeLineup(FIVE) }, { id1: "nope", id2: "nope" }],
  ];
  for (const [name, load, good, bad] of cases) {
    it(`${name}: success + brand fallback carry a long s-maxage`, async () => {
      const Image = (await load()).default as OgImage;
      expect(sMaxAge(await Image(params(good)))).toBeGreaterThanOrEqual(3600);
      expect(sMaxAge(await Image(params(bad)))).toBeGreaterThanOrEqual(3600);
    });
  }

  it("/c (Redis-backed, changes as friends respond): short s-maxage only", async () => {
    const Image = (await import("@/app/c/[id]/opengraph-image")).default;
    ctx.redis!.strings.set("chal:abc12345:info", JSON.stringify({ uid: "u-creator-1", name: "Alice", wins: 55, losses: 27, net: 7.5, grade: "B+", lineup: FIVE.join(","), seed: "h2h-abc12345" }));
    const n = sMaxAge(await Image(params({ id: "abc12345" })));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(300);
  });

  it("/c brand fallback (miss or Redis blip) is never CDN-cached", async () => {
    const Image = (await import("@/app/c/[id]/opengraph-image")).default;
    const res = await Image(params({ id: "nochallenge1" }));
    expect(res.headers.get("cache-control")).not.toMatch(/s-maxage/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });
});

// A page-level openGraph REPLACES the root's (Next merges metadata shallowly per key), so each share
// page must restate og:site_name or unfurls lose the "SweepSzn" attribution line.
describe("share pages keep og:site_name", () => {
  type GenMeta = (a: { params: Promise<Record<string, string>> }) => Promise<{ openGraph?: { siteName?: string } | null }>;
  const pages: [string, () => Promise<{ generateMetadata: unknown }>, Record<string, string>][] = [
    ["/r", () => import("@/app/r/[lineup]/page"), { lineup: encodeLineup(FIVE) }],
    ["/pe", () => import("@/app/pe/[card]/page"), { card: encodePickemCard(encodeLineup(FIVE), VIEW) }],
    ["/sg", () => import("@/app/sg/[card]/page"), { card: encodeSurgeonCard(FIVE.slice(0, 4).concat("shaquille_o_neal_lal_2000s_2001"), 4, FIVE[4]) }],
    ["/rank", () => import("@/app/rank/[card]/page"), { card: encodeRankCard({ scope: "daily", rank: 3, total: 50, name: "Sam", wins: 60, losses: 22, net: 8.1 }) }],
    ["/c", () => import("@/app/c/[id]/page"), { id: "abc12345" }],
    ["/duel", () => import("@/app/duel/[card]/page"), { card: DUEL }],
    ["/dex/s", () => import("@/app/dex/s/[card]/page"), { card: encodeDexShare(FIVE, 40, 3) }],
    ["/compare", () => import("@/app/compare/[id1]/[id2]/page"), { id1: encodeLineup(FIVE), id2: encodeLineup(FIVE) }],
  ];
  for (const [name, load, p] of pages) {
    it(`${name} sets openGraph.siteName`, async () => {
      ctx.redis!.strings.set("chal:abc12345:info", JSON.stringify({ uid: "u-creator-1", name: "Alice", wins: 55, losses: 27, net: 7.5, grade: "B+", lineup: FIVE.join(","), seed: "h2h-abc12345" }));
      const meta = await ((await load()).generateMetadata as GenMeta)(params(p));
      expect(meta.openGraph, "page must render its share metadata").toBeTruthy();
      expect(meta.openGraph!.siteName).toBe(SITE_NAME);
    });
  }
});

describe("/duel/[card] — Draft Duel permalink", () => {
  it("re-evaluates both fives and names the persona in the metadata", async () => {
    const { generateMetadata } = await import("@/app/duel/[card]/page");
    const meta = await generateMetadata(params({ card: DUEL }));
    expect(String(meta.title)).toMatch(/The Analyst/);
    expect(String(meta.title)).toMatch(/\d+-\d+ vs \d+-\d+/);
    expect(meta.robots).toMatchObject({ index: false });
  });

  it("a crafted card (same person on both sides, stale id, garbage) is a 404 / brand card", async () => {
    const page = (await import("@/app/duel/[card]/page")).default;
    for (const card of [encodeDuelCard("bro", FIVE, [FIVE[0], ...BOT5.slice(1)]), encodeDuelCard("bro", FIVE, ["zz_nope", ...BOT5.slice(1)]), "garbage"]) {
      await expect(page(params({ card }))).rejects.toThrow();
    }
    const Image = (await import("@/app/duel/[card]/opengraph-image")).default;
    await Image(params({ card: encodeDuelCard("bro", FIVE, [FIVE[0], ...BOT5.slice(1)]) }));
    expect(og.brandOgElement).toHaveBeenCalled();
  });
});

// W6: the share surfaces read as a claim the viewer can dispute, with the W2 percentile as proof.
describe("share framing — OG cards and metadata read as a claim", () => {
  const INFO = { uid: "u-creator-1", name: "Alice", wins: 58, losses: 24, net: 7.5, grade: "A-", lineup: FIVE.join(","), seed: "classic-123" };

  it("/r OG card: the footer dares the viewer and the percentile line stays", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { getPlayersByIds } = await import("@/lib/data");
    const { evaluateLineup } = await import("@/lib/engine");
    const five = getPlayersByIds(FIVE);
    const html = renderToStaticMarkup(og.resultOgElement(evaluateLineup(five), five));
    expect(html).toContain("Wrong? Beat this five →");
    expect(html).toMatch(/Beats \d+% of real NBA teams since 1985|every real team since 1985/);
  });

  it("/r metadata description is the claim", async () => {
    const { generateMetadata } = await import("@/app/r/[lineup]/page");
    const meta = await generateMetadata(params({ lineup: encodeLineup(FIVE) }));
    expect(String(meta.description)).toMatch(/^Engine says .+ go \d+-\d+\. .+ since 1985\. Wrong\? Beat this five\.$/);
  });

  it("/c OG card: the bar, the percentile, a dare — and still no player tokens", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(og.challengeOgElement("Alice", { wins: 58, losses: 24, net: 7.5, grade: "A-" }));
    expect(html).toMatch(/Beats \d+% of real NBA teams since 1985/);
    expect(html).toContain("Beat this five →");
    expect(html).not.toContain("Jordan");
  });

  it("/c metadata: engine claim, same spins, no names from the five", async () => {
    ctx.redis!.strings.set("chal:abc12345:info", JSON.stringify(INFO));
    const { generateMetadata } = await import("@/app/c/[id]/page");
    const meta = await generateMetadata(params({ id: "abc12345" }));
    expect(String(meta.description)).toMatch(/^Engine says Alice's five goes 58-24\. Beats \d+% of real NBA teams since 1985\. Wrong\? Same spins, your draft\.$/);
    expect(String(meta.description)).not.toContain("Jordan");
  });
});
