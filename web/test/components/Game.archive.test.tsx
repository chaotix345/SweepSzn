// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const boards: Record<string, unknown>[] = [];
const reveals: Record<string, unknown>[] = [];
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/firstPlay", () => ({ markFirstPlay: vi.fn() }));
vi.mock("@/components/Leaderboard", () => ({ default: (p: Record<string, unknown>) => { boards.push(p); return null; } }));
vi.mock("@/components/CeilingReveal", () => ({ default: (p: Record<string, unknown>) => { reveals.push(p); return React.createElement("div", { "data-testid": "ceiling-reveal" }); } }));
vi.mock("@/components/DailyComeback", () => ({ default: () => React.createElement("div", { "data-testid": "daily-comeback" }) }));
vi.mock("@/components/ChallengeResult", () => ({ default: () => null }));
vi.mock("@/components/ChallengeOwner", () => ({ default: () => null }));
vi.mock("@/components/ResultsHistory", () => ({ default: () => null }));
vi.mock("@/components/GoogleOneTap", () => ({ default: () => null }));
vi.mock("@/components/game/PickemOverlay", () => ({ PickemOverlay: () => React.createElement("div", { "data-testid": "pickem" }) }));
vi.mock("@/components/ResultCard", () => ({
  default: (p: { mode: string; afterActions?: React.ReactNode }) => React.createElement("div", { "data-testid": "result-card", "data-mode": p.mode }, p.afterActions),
}));
vi.mock("@/components/InviteFriend", () => ({ default: () => null }));

import Game from "@/components/Game";
import { ev } from "@/lib/ev";
import { listResults } from "@/lib/resultHistory";
import { listArchiveRuns } from "@/lib/archiveHistory";
import { getHistory } from "@/lib/streak";

// W3 past-Daily archive: /play?mode=daily&date=<past day> replays that day's seed on that day's pool,
// unranked — no board, no submit, no crowd beacon, no Pick'Em, nothing in the ranked history.

const NOW = Date.parse("2026-11-26T12:00:00Z");
const TODAY = "2026-11-26";
const PAST = "2026-11-19";

let bodies: { path: string; body: Record<string, unknown> }[] = [];
const evalBody = () => ({
  result: { ortg: 110, drtg: 108, netRtg: 2, wins: 57, losses: 25, winPct: 0.7, grade: "B", label: "Playoff team", factors: [], players: [], notes: [] },
  players: [0, 1, 2, 3, 4].map((i) => ({ id: `c${i}`, name: `Player ${i}`, year: 1986, decade: "1980s", tier: "complete", team: "BOS", pos: "SG", eligible: ["PG", "SG", "SF", "PF", "C"] })),
});
function fetchMock() {
  bodies = [];
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    bodies.push({ path, body });
    if (path === "/api/spin") {
      return { ok: true, json: async () => ({ team: "BOS", decade: "1980s", candidates: [{ id: `c${body.round}`, name: `Player ${body.round}`, year: 1986, decade: "1980s", team: "BOS", pos: "SG", eligible: ["PG", "SG", "SF", "PF", "C"], pts: 1, trb: 1, ast: 1 }] }) } as Response;
    }
    if (path === "/api/evaluate") return { ok: true, json: async () => evalBody() } as Response;
    if (path === "/api/crowd") return { ok: false, json: async () => ({}) } as Response;
    return { ok: true, json: async () => ({}) } as Response;
  });
}

const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };
const btn = (pred: (t: string) => boolean) => screen.getAllByRole("button").find((b) => pred(b.textContent ?? ""))!;

async function draftFive() {
  for (const slot of ["PG", "SG", "SF", "PF", "C"]) {
    await click(btn((t) => /^🎰 spin/i.test(t.trim())));
    await act(async () => { vi.advanceTimersByTime(1200); });
    await act(async () => {});
    await click(screen.getAllByRole("button", { name: /^Select Player/ })[0]);
    { const s = screen.queryAllByRole("button", { name: new RegExp(`^${slot} slot`) })[0]; if (s) await click(s); } // a row tap selects; the court slot places
  }
  await act(async () => {});
}

describe("Game — Daily archive (W3)", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    vi.stubGlobal("fetch", fetchMock());
    boards.length = 0; reveals.length = 0;
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(async () => {
    await act(async () => {});
    cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("replays a past Daily on that day's seed and pool, unranked end to end", async () => {
    window.history.replaceState({}, "", `/play?mode=daily&date=${PAST}`);
    render(<Game />);
    await act(async () => {});
    expect(screen.getByText(/Archive · Nov 19/)).toBeTruthy();
    expect(window.location.search).toBe(""); // the fresh start owns the URL
    await draftFive();

    const spins = bodies.filter((b) => b.path === "/api/spin");
    expect(spins).toHaveLength(5);
    expect(spins.every((b) => b.body.seed === `daily-${PAST}` && b.body.asOf === PAST && b.body.fit === false)).toBe(true);
    // never ranked, never counted: no submit, no crowd beacon, no Pick'Em, no ranked history, no streak
    expect(bodies.some((b) => b.path === "/api/daily/submit")).toBe(false);
    expect(bodies.some((b) => b.path === "/api/slot-pick")).toBe(false);
    expect(bodies.some((b) => b.path === "/api/pickem")).toBe(false);
    expect(screen.queryByTestId("pickem")).toBeNull();
    expect(listResults()).toEqual([]);
    expect(getHistory()).toEqual([]);
    expect(vi.mocked(ev).mock.calls.find((c) => c[0] === "play")?.[1]).toMatchObject({ mode: undefined });

    // the result: unranked copy, no board, and that day's revealed five vs this run
    expect(screen.getByTestId("result-card").getAttribute("data-mode")).toBe("Archive · Nov 19");
    expect(screen.getByTestId("archive-unranked").textContent).toMatch(/Unranked/);
    expect(boards).toHaveLength(0);
    expect(reveals.at(-1)).toMatchObject({ date: PAST, yourWins: 57 });
    expect(listArchiveRuns()[PAST]).toMatchObject({ wins: 57, losses: 25 });
    // a refresh restores it as an archive replay
    const q = new URLSearchParams(window.location.search);
    expect([q.get("m"), q.get("d"), q.get("a")]).toEqual(["daily", PAST, "1"]);
  });

  it("restores an archive result cold (?a=1) without mounting that day's board", async () => {
    window.history.replaceState({}, "", `/play?r=c0,c1,c2,c3,c4&m=daily&d=${PAST}&a=1`);
    render(<Game />);
    await act(async () => {});
    await act(async () => {});
    expect(screen.getByTestId("result-card").getAttribute("data-mode")).toBe("Archive · Nov 19");
    expect(boards).toHaveLength(0);
    expect(reveals.at(-1)).toMatchObject({ date: PAST });
  });

  it.each([TODAY, "2026-11-27", "2026-6-5", "garbage"])("date=%s is not an archive day: plays today's ranked Daily", async (date) => {
    window.history.replaceState({}, "", `/play?mode=daily&date=${date}`);
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Archive ·/)).toBeNull();
    await click(btn((t) => /^🎰 spin/i.test(t.trim())));
    expect(bodies.find((b) => b.path === "/api/spin")?.body.seed).toBe(`daily-${TODAY}`);
  });

  it("today's Daily result carries the come-back block under Share and mounts the board", async () => {
    window.history.replaceState({}, "", "/play?mode=daily");
    render(<Game />);
    await act(async () => {});
    await draftFive();
    expect(screen.getByTestId("result-card").querySelector('[data-testid="daily-comeback"]')).not.toBeNull();
    expect(boards.at(-1)).toMatchObject({ date: TODAY });
    expect(typeof boards.at(-1)?.onStreak).toBe("function");
    expect(listArchiveRuns()).toEqual({});
  });

  it("\"Play today's Daily\" from an archive result reopens today's result when already played", async () => {
    window.history.replaceState({}, "", "/play?mode=daily");
    const today = render(<Game />);
    await act(async () => {});
    await draftFive();
    today.unmount();
    window.history.replaceState({}, "", `/play?mode=daily&date=${PAST}`);
    render(<Game />);
    await act(async () => {});
    await draftFive();
    expect(screen.getByTestId("result-card").getAttribute("data-mode")).toBe("Archive · Nov 19");
    const spins = bodies.filter((b) => b.path === "/api/spin").length;
    await click(btn((t) => /Play today's Daily/.test(t)));
    await act(async () => {});
    expect(screen.getByTestId("result-card").getAttribute("data-mode")).not.toMatch(/Archive/);
    expect(screen.getByTestId("result-card").querySelector('[data-testid="daily-comeback"]')).not.toBeNull();
    expect(boards.at(-1)).toMatchObject({ date: TODAY });
    expect(bodies.filter((b) => b.path === "/api/spin")).toHaveLength(spins); // no re-draft
  });

  it("\"Play today's Daily\" starts today's Daily when it hasn't been played", async () => {
    window.history.replaceState({}, "", `/play?mode=daily&date=${PAST}`);
    render(<Game />);
    await act(async () => {});
    await draftFive();
    await click(btn((t) => /Play today's Daily/.test(t)));
    expect(screen.queryByTestId("result-card")).toBeNull();
    expect(screen.queryByText(/Archive ·/)).toBeNull();
    await click(btn((t) => /^🎰 spin/i.test(t.trim())));
    expect(bodies.filter((b) => b.path === "/api/spin").at(-1)?.body.seed).toBe(`daily-${TODAY}`);
  });

  it("Restart on an archive day restarts the same archive day", async () => {
    window.history.replaceState({}, "", `/play?mode=daily&date=${PAST}`);
    render(<Game />);
    await act(async () => {});
    await click(btn((t) => /^🎰 spin/i.test(t.trim())));
    await act(async () => { vi.advanceTimersByTime(1200); });
    await act(async () => {});
    await click(btn((t) => t.includes("Restart")));
    expect(screen.getByText(/Archive · Nov 19/)).toBeTruthy();
    await click(btn((t) => /^🎰 spin/i.test(t.trim())));
    expect(bodies.filter((b) => b.path === "/api/spin").every((b) => b.body.seed === `daily-${PAST}`)).toBe(true);
  });
});
