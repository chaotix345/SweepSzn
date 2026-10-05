import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { encodeLineup } from "@/lib/share";
import { encodePickemCard } from "@/lib/pickem";

// Share permalinks (/r, /pe, …) + their dynamic OG cards. Pages/OG handlers are plain async
// functions; lib/og's element builders are spied so the OG tests can assert what gets rendered
// without running satori.
vi.mock("@/lib/og", async (orig) => {
  const actual = await orig<typeof import("@/lib/og")>();
  return { ...actual, resultOgElement: vi.fn(actual.resultOgElement) };
});
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

beforeEach(() => { vi.mocked(og.resultOgElement).mockClear(); });

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
