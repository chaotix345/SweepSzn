import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { encodeLineup } from "@/lib/share";
import { encodePickemCard } from "@/lib/pickem";
import { encodeSurgeonCard } from "@/lib/surgeon";
import { encodeDexShare } from "@/lib/share";
import { encodeRankCard } from "@/lib/rankShare";
import { enableRedisEnv, freshFake, ctx } from "@/test/routeHarness";

// Share permalinks are cold-arrival landing pages: each needs one semantic <h1> and a keyboard skip
// link past the ShareHeader to the content (W7 audit F20), and /compare + /rank carry their verdicts.
vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
enableRedisEnv();

const FIVE = [
  "michael_jordan_chi_1980s_1988",
  "lebron_james_cle_2000s_2009",
  "david_robinson_sas_1990s_1994",
  "nikola_joki_den_2020s_2024",
  "kevin_garnett_min_2000s_2004",
];
const OTHER = ["stephen_curry_gsw_2010s_2016", ...FIVE.slice(1)];
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
type Page = (a: { params: Promise<Record<string, string>> }) => Promise<React.ReactElement>;
const html = async (load: () => Promise<{ default: unknown }>, p: Record<string, string>) =>
  renderToStaticMarkup(await ((await load()).default as Page)(params(p)));

beforeEach(() => { freshFake(); });

const rank = (r: number) => encodeRankCard({ scope: "daily", rank: r, total: 50, name: "Sam", wins: 60, losses: 22, net: 8.1 });
const pages: [string, () => Promise<{ default: unknown }>, Record<string, string>][] = [
  ["/r", () => import("@/app/r/[lineup]/page"), { lineup: encodeLineup(FIVE) }],
  ["/pe", () => import("@/app/pe/[card]/page"), { card: encodePickemCard(encodeLineup(FIVE), { y: 7, n: 3, vote: "y" }) }],
  ["/sg", () => import("@/app/sg/[card]/page"), { card: encodeSurgeonCard(FIVE.slice(0, 4).concat("shaquille_o_neal_lal_2000s_2001"), 4, FIVE[4]) }],
  ["/rank", () => import("@/app/rank/[card]/page"), { card: rank(3) }],
  ["/c", () => import("@/app/c/[id]/page"), { id: "abc12345" }],
  ["/dex/s", () => import("@/app/dex/s/[card]/page"), { card: encodeDexShare(FIVE, 40, 3) }],
  ["/compare", () => import("@/app/compare/[id1]/[id2]/page"), { id1: encodeLineup(FIVE), id2: encodeLineup(OTHER) }],
];

describe("share pages: one <h1> and a skip link to the content", () => {
  for (const [name, load, p] of pages) {
    it(name, async () => {
      ctx.redis!.strings.set("chal:abc12345:info", JSON.stringify({ uid: "u-creator-1", name: "Alice", wins: 55, losses: 27, net: 7.5, grade: "B+", lineup: FIVE.join(","), seed: "h2h-abc12345" }));
      const out = await html(load, p);
      expect(out.match(/<h1[\s>]/g)?.length).toBe(1);
      expect(out).toContain('href="#share-content"');
      expect(out).toContain('id="share-content"');
    });
  }
});

describe("/compare verdict", () => {
  it("leads with the winner/margin and links each five to its /r/ result", async () => {
    const id1 = encodeLineup(FIVE), id2 = encodeLineup(OTHER);
    const out = await html(() => import("@/app/compare/[id1]/[id2]/page"), { id1, id2 });
    expect(out).toMatch(/<h1[^>]*>(Five [AB] (wins by \d+ games?|edges it on net rating[^<]*)|Dead even)<\/h1>/);
    expect(out).toContain(`href="/r/${id1}"`);
    expect(out).toContain(`href="/r/${id2}"`);
  });
});

describe("/rank card", () => {
  it("shows the ShareHeader CTA, and #1 alone in gold", async () => {
    const load = () => import("@/app/rank/[card]/page");
    const first = await html(load, { card: rank(1) });
    expect(first).toContain("Can you rank higher?");
    expect(first).toMatch(/text-gold[^"]*">#1</);
    const third = await html(load, { card: rank(3) });
    expect(third).not.toContain("text-gold");
    expect(third).toMatch(/tabular-nums[^"]*">#3</);
  });
});
