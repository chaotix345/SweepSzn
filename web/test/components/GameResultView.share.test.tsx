// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const cardProps: Record<string, unknown>[] = [];
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({ getUid: () => "anon-user-001", getName: () => "Sam" }));
vi.mock("@/components/ResultCard", () => ({ default: (p: Record<string, unknown>) => { cardProps.push(p); return React.createElement("div", { "data-testid": "result-card" }); } }));
vi.mock("@/components/InviteFriend", () => ({ default: () => React.createElement("div", { "data-testid": "invite" }) }));
vi.mock("@/components/Leaderboard", () => ({ default: () => null }));
vi.mock("@/components/FhLeaderboard", () => ({ default: () => null }));
vi.mock("@/components/BpLeaderboard", () => ({ default: () => null }));
vi.mock("@/components/ChallengeResult", () => ({ default: () => null }));
vi.mock("@/components/game/useDailyCeiling", () => ({ useDailyCeiling: () => null }));

import { GameResultView } from "@/components/game/GameResultView";
import { todaySeed, type GameResult } from "@/components/game/gameState";
import { listResults } from "@/lib/resultHistory";
import type { Mode } from "@/components/game/types";

const IDS = ["p0", "p1", "p2", "p3", "p4"];
const RESULT: GameResult = {
  result: { ortg: 110, drtg: 108, netRtg: 2, wins: 50, losses: 32, winPct: 0.61, grade: "B", label: "Playoff team", factors: [], players: [], notes: [] },
  players: IDS.map((id) => ({ id, name: id, year: 1986, decade: "1980s", tier: "complete", team: "BOS", pos: "SF" })),
  trace: IDS.map((pickedId, i) => ({ slot: (["PG", "SG", "SF", "PF", "C"] as const)[i], pickedId, respins: [] })),
  usedHints: true,
} as GameResult;

const view = (mode: Mode, seed: string, result: GameResult = RESULT) => render(
  <GameResultView mode={mode} seed={seed} asOf="2026-11-26" result={result} roundNum={5} onRestart={() => {}} onModeSelect={() => {}} onCreateChallenge={() => {}}
    pickem={{ vote: null, crowd: null, subject: null }} fhPrediction={null} blueprint={null} challengeId={null} challengeRole={null} />,
);
const card = () => cardProps.at(-1) as { challengeShare?: { create: () => Promise<string | null> }; daily?: { date: string; live: boolean }; prime?: boolean };
const convertBtn = () => screen.queryByRole("button", { name: /challenge a friend to beat this/i });

let bodies: Record<string, unknown>[] = [];
beforeEach(() => {
  cardProps.length = 0; bodies = [];
  try { localStorage.clear(); } catch { /* */ }
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body ?? "{}"));
    bodies.push(b);
    return new Response(JSON.stringify({ role: "creator", id: b.id }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("GameResultView — D6 share wiring", () => {
  it("Classic: Share creates the challenge on the game's seed; no separate challenge or invite CTA", async () => {
    view("classic", "classic-42");
    expect(convertBtn()).toBeNull();
    expect(screen.queryByTestId("invite")).toBeNull();
    let path: string | null = null;
    await act(async () => { path = await card().challengeShare!.create(); });
    expect(path).toMatch(/^\/c\/[a-z0-9]{8}$/);
    expect(bodies[0]).toMatchObject({ seed: "classic-42", asOf: "2026-11-26", usedHints: true, uid: "anon-user-001", name: "Sam" });
    // the creator can reopen it: a live-dashboard link, and an entry under "Your results"
    const id = path!.slice(3);
    expect(screen.getByText(/your challenge is live/i).closest("a")?.getAttribute("href")).toBe(`/play?own=${id}`);
    expect(listResults()[0]).toMatchObject({ mode: "challenge", challengeId: id });
  });

  it("Prime: shares as a challenge and keeps the PRIME stamp", () => {
    view("prime", "prime-42");
    expect(card().challengeShare).toBeTruthy();
    expect(card().prime).toBe(true);
  });

  it("a challenge replaying a Prime seed renders as Prime", () => {
    view("challenge", "prime-42");
    expect(card().prime).toBe(true);
    expect(card().challengeShare).toBeUndefined();
  });

  it("a restored result with no trace can't create a challenge (share falls back to /r/)", () => {
    view("classic", "classic-42", { ...RESULT, trace: [] });
    expect(card().challengeShare).toBeUndefined();
  });

  it("Daily: spoiler-free share props (live today), plus the one explicit challenge convert", () => {
    view("daily", `daily-${todaySeed()}`);
    expect(card().daily).toEqual({ date: todaySeed(), live: true });
    expect(card().challengeShare).toBeUndefined();
    expect(convertBtn()?.className).toContain("min-h-11");
    expect(screen.queryByTestId("invite")).toBeNull();
  });

  it("an earlier Daily is no longer live", () => {
    view("daily", "daily-2026-1-1");
    expect(card().daily).toEqual({ date: "2026-1-1", live: false });
  });

  it("Factor Hunt / Blueprint keep the referral invite as their only secondary action", () => {
    view("factorhunt", "fh-2026-11-26");
    expect(screen.getByTestId("invite")).toBeTruthy();
    expect(convertBtn()).toBeNull();
    expect(card().challengeShare).toBeUndefined();
  });
});
