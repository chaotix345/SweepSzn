// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, within, act, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({ getUid: () => "test-uid" }));
// the Dex strip fetches the viewer's collection; a marker is enough to see whether it renders
vi.mock("@/components/game/DexStrip", () => ({ DexStrip: () => React.createElement("div", { "data-testid": "dex-strip" }) }));

import ResultCard from "@/components/ResultCard";
import { track } from "@vercel/analytics";
import type { LineupResult, Player, Slot } from "@/lib/types";

const SLOTS: Slot[] = ["PG", "SG", "SF", "PF", "C"];
const RESULT: LineupResult = {
  ortg: 112.5, drtg: 108.3, netRtg: 4.2, wins: 58, losses: 24, winPct: 0.707, grade: "A", label: "Title contender",
  factors: [{ label: "Star offense", value: 5.1, kind: "good" }, { label: "Spacing", value: -2.3, kind: "bad" }],
  players: [
    { id: "pg", name: "Player PG", off: 3.5, def: 0.8, usage: 28, shooter: true, rimProtector: false },
    { id: "sg", name: "Player SG", off: 2.0, def: 0.5, usage: 22, shooter: true, rimProtector: false },
    { id: "sf", name: "Player SF", off: 1.8, def: 1.2, usage: 20, shooter: false, rimProtector: false },
    { id: "pf", name: "Player PF", off: 1.0, def: 2.5, usage: 16, shooter: false, rimProtector: true },
    { id: "c", name: "Player C", off: 0.5, def: 3.0, usage: 14, shooter: false, rimProtector: true },
  ],
  notes: [],
};
const PLAYERS: Player[] = SLOTS.map((s, i) => ({ id: RESULT.players[i].id, name: `Star ${s}`, year: 1990, decade: "1990s", tier: "complete", team: "CHI", pos: s, pts: 20, trb: 5, ast: 5, stl: 1, blk: 1 }));

const renderCard = (props: Partial<React.ComponentProps<typeof ResultCard>> = {}) =>
  render(<ResultCard result={RESULT} players={PLAYERS} slots={SLOTS} mode="Classic" onReset={() => {}} {...props} />);
const xHref = (c: HTMLElement) => decodeURIComponent(c.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "");
const shareBtn = (c: HTMLElement) => within(c).getByRole("button", { name: /^share$/i });

afterEach(() => { cleanup(); vi.mocked(track).mockClear(); vi.unstubAllGlobals(); });

describe("Classic/Prime share is a Challenge (D6)", () => {
  it("the first Share creates the challenge once and every target then carries /c/ with the claim, no names", async () => {
    const create = vi.fn(async () => "/c/abc12345");
    const { container } = renderCard({ challengeShare: { create } });
    await act(async () => { fireEvent.click(shareBtn(container)); });
    expect(create).toHaveBeenCalledTimes(1);
    const x = xHref(container);
    expect(x).toContain("/c/abc12345");
    expect(x).toContain("Engine says 58-24.");
    expect(x).toContain("Same spins, your draft. Beat this five →");
    expect(x).not.toContain("Star PG");
    // the popover's copy action is labelled for the challenge
    expect(within(container).getByRole("menuitem", { name: /copy challenge link/i })).toBeTruthy();
    fireEvent.click(within(container).getByRole("menuitem", { name: "WhatsApp" }));
    expect(track).toHaveBeenCalledWith("share", { target: "WhatsApp", variant: "challenge" });
    // a second tap re-uses the same challenge
    await act(async () => { fireEvent.click(shareBtn(container)); });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("falls back to the /r/ share (names included) when the challenge can't be created", async () => {
    const create = vi.fn(async () => null);
    const { container } = renderCard({ challengeShare: { create } });
    await act(async () => { fireEvent.click(shareBtn(container)); });
    const x = xHref(container);
    expect(x).toContain("/r/");
    expect(x).toContain("Engine says Star PG · Star SG · Star SF · Star PF · Star C go 58-24.");
    fireEvent.click(within(container).getByRole("menuitem", { name: "Reddit" }));
    expect(track).toHaveBeenCalledWith("share", { target: "Reddit", variant: "fallback" });
    // the nudge stops promising the same spins once the share fell back
    expect(container.textContent).not.toContain("Share sends your exact spins");
  });

  it("X before Share: opens the tab inside the tap, then points it at the challenge intent", async () => {
    const tab = { opener: {} as unknown, location: { href: "" } };
    const open = vi.fn(() => tab);
    vi.stubGlobal("open", open);
    const { container } = renderCard({ challengeShare: { create: async () => "/c/abc12345" } });
    await act(async () => { fireEvent.click(container.querySelector('a[aria-label="Post to X"]')!); });
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(tab.opener).toBeNull();
    expect(decodeURIComponent(tab.location.href)).toContain("twitter.com/intent/tweet");
    expect(decodeURIComponent(tab.location.href)).toContain("/c/abc12345");
    expect(track).toHaveBeenCalledWith("share", { target: "X", variant: "challenge" });
  });

  it("asks for one more tap when the native sheet rejects the late call (Safari user activation)", async () => {
    const share = vi.fn()
      .mockRejectedValueOnce(new DOMException("no activation", "NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      const { container } = renderCard({ challengeShare: { create: async () => "/c/abc12345" } });
      await act(async () => { fireEvent.click(shareBtn(container)); });
      const again = within(container).getByRole("button", { name: /link ready/i });
      await act(async () => { fireEvent.click(again); });
      expect(share).toHaveBeenCalledTimes(2);
      expect(share.mock.calls[1][0].url).toContain("/c/abc12345");
      expect(track).toHaveBeenCalledWith("share", { target: "native", variant: "challenge" });
    } finally {
      delete (navigator as unknown as Record<string, unknown>).share;
    }
  });

  it("the nudge says what the friend gets", () => {
    const { container } = renderCard({ challengeShare: { create: async () => null } });
    expect(container.textContent).toContain("Share sends your exact spins. Your five stays hidden until they've played.");
  });

  it("a plain result (no challenge) shares the /r/ claim as the 'result' variant", () => {
    const { container } = renderCard();
    expect(xHref(container)).toContain("Wrong? Beat this five →");
    fireEvent.click(container.querySelector('a[aria-label="Post to X"]')!);
    expect(track).toHaveBeenCalledWith("share", { target: "X", variant: "result" });
  });
});

describe("Daily share — spoiler-free grid to /play?mode=daily", () => {
  it("while live: grid + record + percentile, no names, links to the Daily", () => {
    const { container } = renderCard({ mode: "Daily", daily: { date: "2026-11-26", live: true } });
    const x = xHref(container);
    expect(x).toContain("SweepSzn Daily · Nov 26\n58-24 · A\n");
    expect(x).toMatch(/[🟩🟨🟥]{5}/u);
    expect(x).toContain("/play?mode=daily");
    expect(x).not.toContain("Star PG");
    expect(x).toContain("\nvia @SweepSeason");
    fireEvent.click(container.querySelector('a[aria-label="Post to Bluesky"]')!);
    expect(track).toHaveBeenCalledWith("share", { target: "Bluesky", variant: "daily" });
  });

  it("drops the Pick'Em defy line on the Daily (it names today's first spin)", () => {
    const { container } = renderCard({ daily: { date: "2026-11-26", live: true }, pickem: { y: 59, n: 41, vote: "n", subject: "1990s Bulls" } });
    expect(xHref(container)).not.toContain("Bulls");
  });

  it("after rollover the five is named", () => {
    const { container } = renderCard({ daily: { date: "2026-11-25", live: false } });
    expect(xHref(container)).toContain("Star PG · Star SG");
  });
});

describe("F02 — one primary pair, one secondary row, 44px targets", () => {
  it("Share and Build Another sit together; X, Bluesky and Save image form the secondary row", () => {
    const { container } = renderCard();
    const share = shareBtn(container);
    const again = within(container).getByRole("button", { name: /build another/i });
    const primaryRow = share.parentElement!.parentElement!;
    expect(primaryRow.contains(again)).toBe(true);
    expect(primaryRow.className).toContain("grid-cols-1");
    const x = container.querySelector('a[aria-label="Post to X"]')!;
    const row = x.parentElement!;
    expect(row.querySelector('a[aria-label="Post to Bluesky"]')).toBeTruthy();
    expect(row.querySelector('button[aria-label="Save card image"]')).toBeTruthy();
    for (const el of [share, again, ...Array.from(row.children)]) expect(el.className).toMatch(/min-h-11|min-h-12/);
  });

  it("the old competing share CTAs are gone from the card (one Share, no separate Bsky/Save rows)", () => {
    const { container } = renderCard();
    expect(within(container).getAllByRole("button", { name: /^share$/i })).toHaveLength(1);
    expect(container.querySelectorAll('button[aria-label="Save card image"]')).toHaveLength(1);
  });
});

describe("Save image never spoils the five", () => {
  const saveBtn = (c: HTMLElement) => c.querySelector('button[aria-label="Save card image"]');
  it("is hidden while the Daily is live, back after the rollover", () => {
    expect(saveBtn(renderCard({ daily: { date: "2026-11-26", live: true } }).container)).toBeNull();
    cleanup();
    expect(saveBtn(renderCard({ daily: { date: "2026-11-25", live: false } }).container)).toBeTruthy();
  });

  it("is hidden on a Classic/Prime challenge share, and returns only if it fell back to /r/", async () => {
    const { container } = renderCard({ challengeShare: { create: async () => "/c/abc12345" } });
    expect(saveBtn(container)).toBeNull();
    await act(async () => { fireEvent.click(shareBtn(container)); });
    expect(saveBtn(container)).toBeNull();
    cleanup();
    const fb = renderCard({ challengeShare: { create: async () => null } }).container;
    expect(saveBtn(fb)).toBeNull();
    await act(async () => { fireEvent.click(shareBtn(fb)); });
    expect(saveBtn(fb)).toBeTruthy();
  });

  it("does not wrap in the 390px row", () => {
    expect(saveBtn(renderCard().container)!.className).toContain("whitespace-nowrap");
  });
});

describe("one orange primary per view", () => {
  it("an archive replay demotes Share (the orange CTA is \"Play today's Daily\" below the card)", () => {
    const { container } = renderCard({ modeKey: "archive" });
    expect(shareBtn(container).className).not.toContain("bg-orange-500");
    cleanup();
    expect(shareBtn(renderCard().container).className).toContain("bg-orange-500");
  });

  it("Share and Build Another share one row height", () => {
    const { container } = renderCard();
    const share = shareBtn(container);
    expect(share.className).toContain("h-full");
    expect(share.parentElement!.parentElement!.className).toContain("auto-rows-fr");
  });

  it("a persisted challenge path is reused: Share never creates a second one", async () => {
    const create = vi.fn(async () => "/c/zzz99999");
    const { container } = renderCard({ challengeShare: { create, path: "/c/abc12345" } });
    await act(async () => { fireEvent.click(shareBtn(container)); });
    expect(create).not.toHaveBeenCalled();
    expect(xHref(container)).toContain("/c/abc12345");
  });
});

describe("F13 — a shared permalink speaks about 'this five', not 'your five'", () => {
  it("hides the viewer's Dex strip and branches the second-person copy", () => {
    const { container, queryByTestId } = renderCard({ shared: true, mode: "shared", usedHints: true });
    expect(queryByTestId("dex-strip")).toBeNull();
    expect(container.textContent).toContain("Starting five");
    expect(container.textContent).not.toContain("Your starting five");
    expect(container.textContent).toMatch(/Lowest-value pick: the /);
    expect(container.querySelector('[title="Drafted with the engine\'s fit hints"]')).toBeTruthy();
    expect(container.querySelector('[aria-label$="this five\'s grade"]')).toBeTruthy();
    expect(container.textContent).toContain("Think you'd draft better?");
    expect(container.textContent).not.toContain("worth sharing");
  });

  it("in-game keeps the Dex strip and 'your' copy", () => {
    const { container, queryByTestId } = renderCard();
    expect(queryByTestId("dex-strip")).toBeTruthy();
    expect(container.textContent).toContain("Your starting five");
  });
});
