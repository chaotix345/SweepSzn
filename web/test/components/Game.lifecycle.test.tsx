// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/firstPlay", () => ({ markFirstPlay: vi.fn() }));
vi.mock("@/lib/streak", () => ({
  getUid: () => "test-uid-life", getName: () => "", setName: vi.fn(),
  recordDailyDone: vi.fn(), getStreak: () => ({ current: 0, longest: 0 }), msToNextUtcMidnight: () => 3600000,
}));
vi.mock("@/components/Leaderboard", () => ({ default: () => null }));
vi.mock("@/components/ChallengeResult", () => ({ default: () => null }));
vi.mock("@/components/ChallengeOwner", () => ({ default: () => null }));
vi.mock("@/components/ResultsHistory", () => ({ default: () => null }));
vi.mock("@/components/FhLeaderboard", () => ({ default: () => null }));
vi.mock("@/components/GoogleOneTap", () => ({ default: () => null }));
vi.mock("@/components/RankShareButton", () => ({ default: () => null }));
vi.mock("@/components/game/PickemOverlay", () => ({ PickemOverlay: () => null }));

import Game from "@/components/Game";

// Spin fixture keyed off the seed: a Classic seed deals the BOS player, anything else (Daily) CHI —
// so a stale Classic spin landing in a Daily game is visible by name.
const spinFor = (seed: string) => {
  const team = seed.startsWith("classic") ? "BOS" : "CHI";
  return {
    team, decade: "1980s",
    candidates: [{ id: `p_${team}`, name: `Player ${team}`, year: 1986, decade: "1980s", team, pos: "SG", eligible: ["PG", "SG", "SF", "PF", "C"], pts: 1, trb: 1, ast: 1 }],
  };
};

type Deferred = { resolve: (body: unknown) => void };
let crowd: Deferred[] = [];
let spinSeeds: string[] = [];

function makeFetchMock() {
  crowd = []; spinSeeds = [];
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = typeof url === "string" ? url.split("?")[0] : "";
    if (path === "/api/spin") {
      const b = JSON.parse(String(init?.body));
      spinSeeds.push(b.seed);
      return { ok: true, json: async () => spinFor(b.seed) } as Response;
    }
    if (path === "/api/crowd") {
      return new Promise<Response>((res) => {
        crowd.push({ resolve: (body) => res({ ok: true, json: async () => body } as Response) });
      });
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

const btn = (pred: (t: string) => boolean) => screen.getAllByRole("button").find((b) => pred(b.textContent ?? ""));
const modeBtn = (name: RegExp) => screen.getAllByRole("button").find((b) => name.test(b.getAttribute("aria-label") ?? ""))!;
const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };

describe("Game — abandoning a game cancels its in-flight work (H4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", makeFetchMock());
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(async () => {
    await act(async () => {});
    cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("a Classic spin still resolving when the player switches to Daily never lands on the Daily board", async () => {
    render(<Game />);
    await click(modeBtn(/^Play Classic mode/));
    await click(btn((t) => t.trim() === "🎰 SPIN")!);
    await click(btn((t) => t.includes("← Modes"))!);
    await click(modeBtn(/^Play Daily mode/));
    await act(async () => { vi.advanceTimersByTime(1500); });
    await act(async () => {});
    expect(document.querySelector("header span.capitalize")?.textContent).toBe("daily");
    expect(spinSeeds).toHaveLength(1);
    expect(spinSeeds[0].startsWith("classic-")).toBe(true);
    expect(screen.queryByText("Player BOS")).toBeNull();
  });

  it("the next game's SPIN is live immediately — not stuck behind the abandoned spin", async () => {
    render(<Game />);
    await click(modeBtn(/^Play Classic mode/));
    await click(btn((t) => t.trim() === "🎰 SPIN")!);
    await click(btn((t) => t.includes("← Modes"))!);
    await click(modeBtn(/^Play Daily mode/));
    expect(screen.queryAllByText("Spinning…")).toHaveLength(0);
    await click(btn((t) => t.trim() === "🎰 SPIN")!);
    await act(async () => { vi.advanceTimersByTime(1500); });
    await act(async () => {});
    expect(spinSeeds.map((s) => s.split("-")[0])).toEqual(["classic", "daily"]);
    expect(screen.queryByText("Player CHI")).toBeTruthy();
    expect(screen.queryByText("Player BOS")).toBeNull();
  });

  it("a crowd-note fetch from the abandoned game does not surface in the next game", async () => {
    render(<Game />);
    await click(modeBtn(/^Play Classic mode/));
    await click(btn((t) => t.trim() === "🎰 SPIN")!);
    await act(async () => { vi.advanceTimersByTime(1200); });
    await act(async () => {});
    await click(screen.getAllByRole("button", { name: /Select Player BOS/i })[0]);
    await click(screen.getAllByRole("button", { name: /^PG slot/ })[0]);
    expect(crowd).toHaveLength(1);
    await click(btn((t) => t.includes("← Modes"))!);
    await click(modeBtn(/^Play Daily mode/));
    await act(async () => { crowd[0].resolve({ crowd: { choices: [{ pct: 62, name: "Player BOS" }] } }); });
    await act(async () => {});
    expect(document.querySelector("header span.capitalize")?.textContent).toBe("daily");
    expect(screen.queryByText(/of players took/i)).toBeNull();
  });
});
