// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const challengeProps: Record<string, unknown>[] = [];
const cardProps: Record<string, unknown>[] = [];
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/firstPlay", () => ({ markFirstPlay: vi.fn() }));
vi.mock("@/lib/streak", () => ({
  getUid: () => "test-uid-pool", getName: () => "", setName: vi.fn(),
  recordDailyDone: vi.fn(), getStreak: () => ({ current: 0, longest: 0 }), msToNextUtcMidnight: () => 3600000,
}));
vi.mock("@/components/Leaderboard", () => ({ default: () => null }));
vi.mock("@/components/ChallengeResult", () => ({ default: (p: Record<string, unknown>) => { challengeProps.push(p); return null; } }));
vi.mock("@/components/ChallengeOwner", () => ({ default: () => null }));
vi.mock("@/components/ResultsHistory", () => ({ default: () => null }));
vi.mock("@/components/FhLeaderboard", () => ({ default: () => null }));
vi.mock("@/components/GoogleOneTap", () => ({ default: () => null }));
vi.mock("@/components/RankShareButton", () => ({ default: () => null }));
vi.mock("@/components/game/PickemOverlay", () => ({ PickemOverlay: () => null }));
vi.mock("@/components/ResultCard", () => ({ default: (p: Record<string, unknown>) => { cardProps.push(p); return React.createElement("div", { "data-testid": "result-card" }); } }));
vi.mock("@/components/InviteFriend", () => ({ default: () => null }));

import Game from "@/components/Game";
import { encodeLineup } from "@/lib/share";
import { writeLastResult, readLastResult, saveResult } from "@/lib/resultHistory";
import { LEGACY_AS_OF, SEASON_2026_SINCE } from "@/lib/poolDate";

// Pool by date (W5): a Classic/HoopIQ result converted to a challenge carries the pool date it was
// drafted on, or challenge/submit replays it against the wrong pool and rejects it.

const IDS = ["p0", "p1", "p2", "p3", "p4"];
const ENC = encodeLineup(IDS, false, false, null);
const evalBody = () => ({
  result: { ortg: 110, drtg: 108, netRtg: 2, wins: 50, losses: 32, winPct: 0.61, grade: "B", label: "Playoff team", factors: [], players: [], notes: [] },
  players: IDS.map((id) => ({ id, name: id, year: 1986, decade: "1980s", tier: "complete", team: "BOS", pos: "SF", eligible: ["SF"] })),
});
const TRACE = IDS.map((pickedId, i) => ({ slot: ["PG", "SG", "SF", "PF", "C"][i], pickedId, respins: [] }));
const RELEASE = Date.parse(`${SEASON_2026_SINCE}T00:00:00Z`);
const NOW = RELEASE + 5 * 86_400_000; // 2026-12-02
const TODAY = "2026-12-02";

let bodies: { path: string; body: Record<string, unknown> }[] = [];
function fetchMock() {
  bodies = [];
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    bodies.push({ path, body });
    if (path === "/api/spin") {
      return { ok: true, json: async () => ({ team: "BOS", decade: "1980s", candidates: [{ id: `c${body.round}`, name: `Player ${body.round}`, year: 1986, decade: "1980s", team: "BOS", pos: "SG", eligible: ["PG", "SG", "SF", "PF", "C"], pts: 1, trb: 1, ast: 1 }] }) } as Response;
    }
    if (path === "/api/project") return { ok: true, json: async () => ({ floor: { wins: 30, losses: 52, grade: "D" }, ceiling: { wins: 60, losses: 22, grade: "A" }, n: 1 }) } as Response;
    if (path === "/api/evaluate") return { ok: true, json: async () => evalBody() } as Response;
    return { ok: true, json: async () => ({}) } as Response;
  });
}

const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };
const btn = (pred: (t: string) => boolean) => screen.getAllByRole("button").find((b) => pred(b.textContent ?? ""))!;

// D6: a Classic result's Share creates the challenge — drive the card's challengeShare.create().
async function restoreAndConvert(): Promise<unknown> {
  window.history.replaceState({}, "", `/play?r=${ENC}&m=classic`);
  render(<Game />);
  await act(async () => {});
  expect(screen.queryByTestId("result-card")).toBeTruthy();
  const share = cardProps.at(-1)?.challengeShare as { create: () => Promise<string | null> } | undefined;
  expect(share, "a Classic result shares as a challenge").toBeTruthy();
  await act(async () => { await share!.create(); });
  return bodies.find((b) => b.path === "/api/challenge/submit")?.body.asOf;
}

describe("Game — a converted Classic result carries its pool date", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
    vi.stubGlobal("fetch", fetchMock());
    challengeProps.length = 0; cardProps.length = 0;
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(async () => {
    await act(async () => {});
    cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
  });

  const saved = (asOf?: string) => {
    const ev = evalBody();
    writeLastResult({ mode: "classic", seed: "classic-7", ...(asOf ? { asOf } : {}), result: { result: ev.result, players: ev.players, trace: TRACE, usedHints: false } });
  };

  it("a restored result converts with its stored pool date", async () => {
    saved("2026-11-20");
    expect(await restoreAndConvert()).toBe("2026-11-20");
  });

  it("an older saved result (no pool date) played before the release converts on the legacy pool", async () => {
    vi.setSystemTime(RELEASE - 3_600_000);
    saveResult({ encoded: ENC, mode: "classic", wins: 50, losses: 32, grade: "B" });
    vi.setSystemTime(NOW);
    saved();
    expect(await restoreAndConvert()).toBe(LEGACY_AS_OF);
  });

  it("an older saved result (no pool date) played after the release converts on today's pool", async () => {
    saveResult({ encoded: ENC, mode: "classic", wins: 50, losses: 32, grade: "B" });
    saved();
    expect(await restoreAndConvert()).toBe(TODAY);
  });

  it("a fresh Classic game sends its start day with spins and projections, and saves it", async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    render(<Game />);
    await click(screen.getAllByRole("button").find((b) => /^Play Classic mode/.test(b.getAttribute("aria-label") ?? ""))!);
    for (const slot of ["PG", "SG", "SF", "PF", "C"]) {
      await click(btn((t) => /^🎰 spin/i.test(t.trim())));
      await act(async () => { vi.advanceTimersByTime(1200); });
      await act(async () => {});
      await click(screen.getAllByRole("button", { name: /^Select Player/ })[0]);
      { const s = screen.queryAllByRole("button", { name: new RegExp(`^${slot} slot`) })[0]; if (s) await click(s); } // a row tap selects; the court slot places
    }
    await act(async () => {});
    const spins = bodies.filter((b) => b.path === "/api/spin");
    const projects = bodies.filter((b) => b.path === "/api/project");
    expect(spins).toHaveLength(5);
    expect(projects.length).toBeGreaterThan(0);
    expect([...spins, ...projects].every((b) => b.body.asOf === TODAY)).toBe(true);
    expect(readLastResult<{ asOf?: string }>()?.asOf).toBe(TODAY);
  });
});
