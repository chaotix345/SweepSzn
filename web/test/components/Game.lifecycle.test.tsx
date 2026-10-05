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
vi.mock("@/components/ResultCard", () => ({ default: () => React.createElement("div", { "data-testid": "result-card" }) }));
vi.mock("@/components/InviteFriend", () => ({ default: () => null }));
vi.mock("@/components/SignInSaveNudge", () => ({ default: () => null }));

import Game from "@/components/Game";
import { encodeLineup } from "@/lib/share";
import { writeLastResult, listResults } from "@/lib/resultHistory";

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
let evals: Deferred[] = [];
let spinSeeds: string[] = [];
let calls: string[] = [];

const IDS = ["p0", "p1", "p2", "p3", "p4"];
const makeEval = () => ({
  result: { ortg: 110, drtg: 108, netRtg: 2, wins: 50, losses: 32, winPct: 0.61, grade: "B", label: "Playoff team", factors: [], players: [], notes: [] },
  players: IDS.map((id) => ({ id, name: id, year: 1986, decade: "1980s", tier: "complete", team: "BOS", pos: "SF", eligible: ["SF"] })),
});

function makeFetchMock() {
  crowd = []; evals = []; spinSeeds = []; calls = [];
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = typeof url === "string" ? url.split("?")[0] : "";
    calls.push(path);
    if (path.startsWith("/api/challenge/")) return { ok: true, json: async () => ({ seed: "classic-4242" }) } as Response;
    if (path === "/api/project") {
      return { ok: true, json: async () => ({ floor: { wins: 30, losses: 52, grade: "D" }, ceiling: { wins: 60, losses: 22, grade: "A" }, n: 1 }) } as Response;
    }
    if (path === "/api/evaluate") {
      return new Promise<Response>((res) => {
        evals.push({ resolve: (body) => res({ ok: true, json: async () => body } as Response) });
      });
    }
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
async function draftFive(): Promise<void> {
  for (const slot of ["PG", "SG", "SF", "PF", "C"]) {
    await click(btn((t) => /^🎰 spin/i.test(t.trim()))!);
    await act(async () => { vi.advanceTimersByTime(1200); });
    await act(async () => {});
    await click(screen.getAllByRole("button", { name: /^Select Player/ })[0]);
    await click(screen.getAllByRole("button", { name: new RegExp(`^${slot} slot`) })[0]);
  }
}

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

describe("Game — ← Modes abandons the game and owns the URL (L20)", () => {
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

  it("← Modes from a restored result strips ?r=&m= so a refresh shows the picker, not the old result", async () => {
    const ev = makeEval();
    writeLastResult({ mode: "classic", seed: "classic-7", result: { result: ev.result, players: ev.players, trace: [], usedHints: false } });
    window.history.replaceState({}, "", `/play?r=${encodeLineup(IDS, false, false, null)}&m=classic`);
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByTestId("result-card")).toBeTruthy();
    await click(btn((t) => t.includes("← Modes"))!);
    const q = new URLSearchParams(window.location.search);
    expect(["r", "m", "d", "sg", "own"].filter((k) => q.has(k))).toEqual([]);
    cleanup();
    render(<Game />); // the refresh
    await act(async () => {});
    expect(screen.queryByTestId("result-card")).toBeNull();
    expect(screen.queryByText(/Pick your mode/i)).toBeTruthy();
  });

  it("← Modes while the season is simulating drops the late result (not saved, not restorable)", async () => {
    render(<Game />);
    await click(modeBtn(/^Play Classic mode/));
    await draftFive();
    expect(evals).toHaveLength(1);
    await click(btn((t) => t.includes("← Modes"))!);
    await act(async () => { evals[0].resolve(makeEval()); });
    await act(async () => {});
    expect(listResults()).toEqual([]);
    expect(screen.queryByText(/Pick your mode/i)).toBeTruthy();
  });
});

describe("Game — no live projection for challenge responders (M7, DESIGN.md §12)", () => {
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

  async function firstPick() {
    await click(btn((t) => /^🎰 spin/i.test(t.trim()))!);
    await act(async () => { vi.advanceTimersByTime(1200); });
    await act(async () => {});
    await click(screen.getAllByRole("button", { name: /^Select Player/ })[0]);
    await click(screen.getAllByRole("button", { name: /^PG slot/ })[0]);
    await act(async () => {});
  }

  it("Classic free-play shows the floor↔ceiling meter after the first pick (control)", async () => {
    render(<Game />);
    await click(modeBtn(/^Play Classic mode/));
    await firstPick();
    expect(calls).toContain("/api/project");
    expect(screen.queryByText(/Projected wins/)).toBeTruthy();
  });

  it("a challenge converted from Classic (classic-<n> seed) never fetches or shows the projection", async () => {
    window.history.replaceState({}, "", "/play?c=abc123");
    render(<Game />);
    await act(async () => {});
    expect(document.querySelector("header span.capitalize")?.textContent).toBe("challenge");
    await firstPick();
    expect(spinSeeds).toEqual(["classic-4242"]);
    expect(calls).not.toContain("/api/project");
    expect(screen.queryByText(/Projected wins/)).toBeNull();
  });
});

describe("Game — the no-fit warning offers an action that can change the spin (M21)", () => {
  // Round 0 deals an anchor who fits anywhere; every later spin (base or re-spun) deals a PG-only
  // player — so once PG is filled the board is a dead end. A plain spin is deterministic in
  // (seed, round, salt), so only a re-spin (salted + counted in the trace) or a restart moves it.
  let spinBodies: Record<string, unknown>[] = [];
  const stuckFetch = () => vi.fn(async (url: string, init?: RequestInit) => {
    const path = typeof url === "string" ? url.split("?")[0] : "";
    if (path !== "/api/spin") return { ok: true, json: async () => ({}) } as Response;
    const b = JSON.parse(String(init?.body));
    spinBodies.push(b);
    const anchor = b.round === 0;
    const team = anchor ? "BOS" : b.salt ? `T${b.salt}` : "LAL";
    return { ok: true, json: async () => ({
      team, decade: "1980s",
      candidates: [{ id: `p_${team}`, name: anchor ? "Anchor Guy" : `Stuck ${team}`, year: 1986, decade: "1980s", team, pos: "PG", eligible: anchor ? ["PG", "SG", "SF", "PF", "C"] : ["PG"], pts: 1, trb: 1, ast: 1 }],
    }) } as Response;
  });
  const settle = async () => { await act(async () => { vi.advanceTimersByTime(1200); }); await act(async () => {}); };
  const warningAction = () => screen.getByText(/No one here fits/).querySelector("button")!;

  beforeEach(() => {
    vi.useFakeTimers();
    spinBodies = [];
    vi.stubGlobal("fetch", stuckFetch());
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(async () => {
    await act(async () => {});
    cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
  });

  async function reachDeadEnd() {
    render(<Game />);
    await click(modeBtn(/^Play Classic mode/));
    await click(btn((t) => /^🎰 spin/i.test(t.trim()))!);
    await settle();
    await click(screen.getAllByRole("button", { name: /^Select Anchor Guy/ })[0]);
    await click(screen.getAllByRole("button", { name: /^PG slot/ })[0]);
    await click(btn((t) => /^🎰 spin/i.test(t.trim()))!);
    await settle();
    expect(screen.queryByText(/No one here fits/)).toBeTruthy();
  }

  it("with a re-spin left, the warning's action is that re-spin — not a repeat of the identical spin", async () => {
    await reachDeadEnd();
    const before = spinBodies.length;
    await click(warningAction());
    await settle();
    expect(spinBodies).toHaveLength(before + 1);
    const last = spinBodies[before];
    expect(last).not.toEqual(spinBodies[before - 1]);
    expect(last).toMatchObject({ round: 1, salt: 1, lockedDecade: "1980s", excludeTeam: "LAL" });
  });

  it("with both re-spins spent, the warning offers a restart instead of a dead button", async () => {
    await reachDeadEnd();
    await click(btn((t) => t.includes("Re-spin Team"))!);
    await settle();
    await click(btn((t) => t.includes("Re-spin Era"))!);
    await settle();
    expect(screen.queryByText(/No one here fits/)).toBeTruthy();
    const before = spinBodies.length;
    await click(warningAction());
    await act(async () => {});
    expect(spinBodies).toHaveLength(before); // no futile spin request
    expect(screen.queryByText(/No one here fits/)).toBeNull();
    expect(screen.getByRole("img", { name: /Lineup so far/ }).getAttribute("aria-label")).toContain("PG open"); // fresh game
  });
});
