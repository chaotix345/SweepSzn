// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// --- all module mocks before any component imports ---

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({
  getUid: () => "test-uid-sg",
  getName: () => "",
  setName: vi.fn(),
  recordDailyDone: vi.fn(),
  getStreak: () => ({ current: 0, longest: 0 }),
  msToNextUtcMidnight: () => 3600000,
}));

vi.mock("@/components/Leaderboard", () => ({ default: () => null }));
vi.mock("@/components/ChallengeResult", () => ({ default: () => null }));
vi.mock("@/components/ChallengeOwner", () => ({ default: () => null }));
vi.mock("@/components/ResultsHistory", () => ({ default: () => null }));
vi.mock("@/components/FhLeaderboard", () => ({ default: () => null }));
vi.mock("@/components/GoogleOneTap", () => ({ default: () => null }));
vi.mock("@/components/RankShareButton", () => ({ default: () => null }));
vi.mock("@/components/SgLeaderboard", () => ({ default: () => null }));
vi.mock("@/components/BpLeaderboard", () => ({ default: () => null }));
vi.mock("@/components/SurgeonResult", () => ({ default: () => React.createElement("div", { "data-testid": "surgeon-result" }, "SurgeonResult") }));

// --- import component AFTER mocks ---
import Game from "@/components/Game";

// --- fixtures ---

const makeSpin = (team = "BOS", decade = "1980s") => ({
  team,
  decade,
  candidates: [
    {
      id: "bird", name: "Larry Bird", year: 1986, decade, team,
      pos: "SF", eligible: ["PG", "SG", "SF", "PF", "C"],
      pts: 25.8, trb: 9.8, ast: 6.8, stl: 1.6, blk: 0.6,
    },
  ],
});

const makeEvalResult = () => ({
  result: {
    ortg: 110.0, drtg: 108.0, netRtg: 2.0, wins: 50, losses: 32,
    winPct: 0.61, grade: "B", label: "Playoff team",
    factors: [
      { label: "Spacing", value: -3.0, kind: "bad" },
      { label: "Star offense", value: 5.0, kind: "good" },
    ],
    players: Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, name: `Player ${i}`, off: 1.5, def: 0.8, usage: 20, shooter: i < 2, rimProtector: i >= 3,
    })),
    notes: [],
  },
  players: Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`, name: `Player ${i}`, year: 1986, decade: "1980s", tier: "complete" as const,
    team: "BOS", pos: "SF" as const, eligible: ["SF"], pts: 22, trb: 8, ast: 5, stl: 1.2, blk: 0.4,
  })),
});

// Pool response: three candidates offered by the server after diagnosing the five.
// The "in" candidate must be eligible for at least one slot in the roster.
const makePoolResponse = () => ({
  diagnosis: { kind: "worst", label: "Spacing", canonical: "Spacing", value: -3.0 },
  before: { wins: 50, losses: 32, net: 2.0, grade: "B" },
  candidates: [
    {
      id: "shooter1", name: "Reggie Miller", team: "IND", decade: "1990s",
      pos: "SG", eligible: ["SG", "SF"],
      why: "floor spacer — 2.8 3PM on 6.0 attempts", stat: "2.8 3PM",
    },
    {
      id: "shooter2", name: "Ray Allen", team: "SEA", decade: "2000s",
      pos: "SG", eligible: ["SG", "SF"],
      why: "floor spacer — 2.6 3PM on 5.8 attempts", stat: "2.6 3PM",
    },
    {
      id: "shooter3", name: "Glen Rice", team: "CHA", decade: "1990s",
      pos: "SF", eligible: ["SF", "SG"],
      why: "floor spacer — 2.1 3PM on 4.9 attempts", stat: "2.1 3PM",
    },
  ],
});

// Submit response — the "reveal" after the swap is confirmed.
const makeSubmitResponse = () => ({
  delta: 7,
  card: "p0,p1,p2,p3,p4.2.shooter1",
  view: null,
  diagnosis: { kind: "worst", label: "Spacing", canonical: "Spacing", value: -3.0 },
  swap: { outId: "p2", inId: "shooter1" },
  before: {
    ortg: 110.0, drtg: 108.0, netRtg: 2.0, wins: 50, losses: 32,
    winPct: 0.61, grade: "B", label: "Playoff team",
    factors: [{ label: "Spacing", value: -3.0, kind: "bad" }],
    players: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, off: 1.5, def: 0.8, usage: 20, shooter: false, rimProtector: false })),
    notes: [],
  },
  beforePlayers: Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`, name: `Player ${i}`, year: 1986, decade: "1980s", tier: "complete" as const,
    team: "BOS", pos: "SF" as const, eligible: ["SF"],
  })),
  after: {
    ortg: 114.0, drtg: 107.0, netRtg: 7.0, wins: 57, losses: 25,
    winPct: 0.695, grade: "A", label: "Title contender",
    factors: [{ label: "Spacing", value: 2.5, kind: "good" }],
    players: Array.from({ length: 5 }, (_, i) => ({ id: i === 2 ? "shooter1" : `p${i}`, name: i === 2 ? "Reggie Miller" : `Player ${i}`, off: 2.0, def: 0.9, usage: 19, shooter: i === 2, rimProtector: false })),
    notes: [],
  },
  afterPlayers: Array.from({ length: 5 }, (_, i) => ({
    id: i === 2 ? "shooter1" : `p${i}`, name: i === 2 ? "Reggie Miller" : `Player ${i}`,
    year: i === 2 ? 1995 : 1986, decade: i === 2 ? "1990s" : "1980s", tier: "complete" as const,
    team: i === 2 ? "IND" : "BOS", pos: "SF" as const, eligible: ["SF"],
  })),
});

// Tracks every fetch call so tests can assert no spurious submits fired.
type FetchCall = { url: string; body?: unknown };
let fetchCalls: FetchCall[] = [];

function makeFetchMock(poolResponse = makePoolResponse()) {
  fetchCalls = [];
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = typeof url === "string" ? url.split("?")[0] : "";
    fetchCalls.push({ url: path, body: init?.body ? JSON.parse(init.body as string) : undefined });
    let body: unknown = {};
    if (path === "/api/spin") body = makeSpin();
    else if (path === "/api/evaluate") body = makeEvalResult();
    else if (path === "/api/surgeon/pool") body = poolResponse;
    else if (path === "/api/surgeon/submit") body = makeSubmitResponse();
    else if (path === "/api/pickem") body = { y: 5, n: 3, vote: null };
    return { ok: true, json: async () => body } as Response;
  });
}

// ---- shared helpers ----

function renderGame() {
  try { localStorage.clear(); } catch { /* */ }
  return render(<Game />);
}

function findSurgeonModeBtn(): HTMLElement {
  const allBtns = screen.getAllByRole("button");
  return allBtns.find((b) => b.getAttribute("aria-label") === "Play Surgeon mode")!;
}

function findSpinBtn(): HTMLElement {
  return screen.getAllByRole("button").find((b) => b.textContent?.trim() === "🎰 SPIN")!;
}

async function spinAndWait(): Promise<void> {
  const spinBtn = findSpinBtn();
  await act(async () => { fireEvent.click(spinBtn); });
  await act(async () => { vi.advanceTimersByTime(1200); });
  await act(async () => {});
}

// Reach the surgeon swap dialog: pick Surgeon mode, complete all 5 draft picks.
// The 6th act() flush waits for the /api/surgeon/pool fetch to resolve and setSgPool to fire.
async function reachSurgeonDialog(): Promise<void> {
  await act(async () => { fireEvent.click(findSurgeonModeBtn()); });

  for (const slot of ["PG", "SG", "SF", "PF", "C"] as const) {
    await spinAndWait();

    const candidateBtns = screen.getAllByRole("button", { name: /Select Larry Bird/i });
    await act(async () => { fireEvent.click(candidateBtns[0]); });

    const slotBtn = screen.getAllByRole("button").find(
      (b) => {
        const lbl = b.getAttribute("aria-label") ?? "";
        return lbl.startsWith(`${slot} slot`) && (lbl.includes("empty") || lbl.includes("eligible"));
      }
    );
    if (slotBtn) {
      await act(async () => { fireEvent.click(slotBtn); });
    } else {
      const allBtns = screen.getAllByRole("button");
      const fallback = allBtns.find((b) => b.getAttribute("aria-label")?.startsWith(slot));
      if (fallback) await act(async () => { fireEvent.click(fallback); });
    }
    await act(async () => {});
  }

  // Wait for the pool fetch to complete and the dialog to mount.
  await act(async () => {});
  await act(async () => {});
}

// ======================================================================
// TESTS
// ======================================================================

describe("Game — Surgeon swap dialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", makeFetchMock());
    try { localStorage.clear(); } catch { /* */ }
  });

  afterEach(async () => {
    await act(async () => {});
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    fetchCalls = [];
  });

  it("completing a draft in Surgeon mode triggers /api/surgeon/pool and opens the swap dialog", async () => {
    renderGame();
    await reachSurgeonDialog();

    const dialog = screen.queryByRole("dialog", { name: /Surgeon replacement pool/i });
    expect(dialog).toBeTruthy();

    const poolCall = fetchCalls.find((c) => c.url === "/api/surgeon/pool");
    expect(poolCall).toBeTruthy();
  });

  it("swap dialog shows all three candidates from the dealt pool", async () => {
    renderGame();
    await reachSurgeonDialog();

    const dialog = screen.getByRole("dialog", { name: /Surgeon replacement pool/i });
    expect(dialog.textContent).toContain("Reggie Miller");
    expect(dialog.textContent).toContain("Ray Allen");
    expect(dialog.textContent).toContain("Glen Rice");
  });

  it("swap dialog shows the diagnosis label", async () => {
    renderGame();
    await reachSurgeonDialog();

    const dialog = screen.getByRole("dialog", { name: /Surgeon replacement pool/i });
    expect(dialog.textContent).toContain("Spacing");
  });

  it("Confirm swap button is disabled until both candidate-in and player-out are chosen", async () => {
    renderGame();
    await reachSurgeonDialog();

    const confirmBtn = screen.getByRole("button", { name: /Confirm swap/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    // Select the first candidate-in
    const candidateRadios = screen.getAllByRole("radio", { name: /Reggie Miller/i });
    await act(async () => { fireEvent.click(candidateRadios[0]); });

    // Still disabled — no swap-out selected yet
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("selecting candidate-in reveals the swap-out radiogroup", async () => {
    renderGame();
    await reachSurgeonDialog();

    // Before selecting a candidate-in, no "swap out" radiogroup
    expect(screen.queryByRole("radiogroup", { name: /Player to swap out/i })).toBeNull();

    const candidateRadios = screen.getAllByRole("radio", { name: /Reggie Miller/i });
    await act(async () => { fireEvent.click(candidateRadios[0]); });
    await act(async () => {});

    expect(screen.getByRole("radiogroup", { name: /Player to swap out/i })).toBeTruthy();
  });

  it("selecting candidate-in + eligible player-out enables the Confirm button", async () => {
    renderGame();
    await reachSurgeonDialog();

    const confirmBtn = screen.getByRole("button", { name: /Confirm swap/i });

    // Select Reggie Miller (eligible for SF slot)
    const inRadios = screen.getAllByRole("radio", { name: /Reggie Miller/i });
    await act(async () => { fireEvent.click(inRadios[0]); });
    await act(async () => {});

    // Select an eligible drafted player to swap out — find any radio in the "swap out" group
    const outGroup = screen.getByRole("radiogroup", { name: /Player to swap out/i });
    const eligibleBtns = Array.from(outGroup.querySelectorAll<HTMLElement>("[role=radio]:not([aria-disabled=true])"));
    expect(eligibleBtns.length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(eligibleBtns[0]); });
    await act(async () => {});

    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Escape dismisses the dialog WITHOUT firing a submit fetch", async () => {
    renderGame();
    await reachSurgeonDialog();

    const dialog = screen.getByRole("dialog", { name: /Surgeon replacement pool/i });
    const submitCallsBefore = fetchCalls.filter((c) => c.url === "/api/surgeon/submit").length;

    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    });
    await act(async () => {});

    expect(screen.queryByRole("dialog", { name: /Surgeon replacement pool/i })).toBeNull();
    const submitCallsAfter = fetchCalls.filter((c) => c.url === "/api/surgeon/submit").length;
    expect(submitCallsAfter).toBe(submitCallsBefore);
  });

  it("Back to draft button dismisses the dialog WITHOUT firing a submit fetch", async () => {
    renderGame();
    await reachSurgeonDialog();

    const submitCallsBefore = fetchCalls.filter((c) => c.url === "/api/surgeon/submit").length;

    const backBtn = screen.getByRole("button", { name: /Back to the draft/i });
    await act(async () => { fireEvent.click(backBtn); });
    await act(async () => {});

    expect(screen.queryByRole("dialog", { name: /Surgeon replacement pool/i })).toBeNull();
    const submitCallsAfter = fetchCalls.filter((c) => c.url === "/api/surgeon/submit").length;
    expect(submitCallsAfter).toBe(submitCallsBefore);
  });

  it("confirming a valid swap fires /api/surgeon/submit with outId and inId", async () => {
    renderGame();
    await reachSurgeonDialog();

    // Select Reggie Miller as the replacement
    const inRadios = screen.getAllByRole("radio", { name: /Reggie Miller/i });
    await act(async () => { fireEvent.click(inRadios[0]); });
    await act(async () => {});

    // Select an eligible player to swap out
    const outGroup = screen.getByRole("radiogroup", { name: /Player to swap out/i });
    const eligibleBtns = Array.from(outGroup.querySelectorAll<HTMLElement>("[role=radio]:not([aria-disabled=true])"));
    await act(async () => { fireEvent.click(eligibleBtns[0]); });
    await act(async () => {});

    const confirmBtn = screen.getByRole("button", { name: /Confirm swap/i });
    await act(async () => { fireEvent.click(confirmBtn); });
    await act(async () => {});
    await act(async () => {});

    const submitCall = fetchCalls.find((c) => c.url === "/api/surgeon/submit");
    expect(submitCall).toBeTruthy();
    expect((submitCall!.body as Record<string, unknown>).inId).toBe("shooter1");
    expect(typeof (submitCall!.body as Record<string, unknown>).outId).toBe("string");
    expect(typeof (submitCall!.body as Record<string, unknown>).trace).toBe("object");
  });

  it("while submit is in flight (busy), the dialog stays mounted", async () => {
    // Use a fetch mock that stalls the submit so we can observe the busy state
    let resolveSubmit!: (v: Response) => void;
    const stalledFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const path = (url as string).split("?")[0];
      fetchCalls.push({ url: path, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (path === "/api/surgeon/submit") {
        return new Promise<Response>((res) => { resolveSubmit = res; });
      }
      // all other calls resolve immediately
      let body: unknown = {};
      if (path === "/api/spin") body = makeSpin();
      else if (path === "/api/evaluate") body = makeEvalResult();
      else if (path === "/api/surgeon/pool") body = makePoolResponse();
      else if (path === "/api/pickem") body = { y: 5, n: 3, vote: null };
      return { ok: true, json: async () => body } as Response;
    });
    vi.stubGlobal("fetch", stalledFetch);

    renderGame();
    await reachSurgeonDialog();

    const inRadios = screen.getAllByRole("radio", { name: /Reggie Miller/i });
    await act(async () => { fireEvent.click(inRadios[0]); });
    await act(async () => {});

    const outGroup = screen.getByRole("radiogroup", { name: /Player to swap out/i });
    const eligibleBtns = Array.from(outGroup.querySelectorAll<HTMLElement>("[role=radio]:not([aria-disabled=true])"));
    await act(async () => { fireEvent.click(eligibleBtns[0]); });
    await act(async () => {});

    const confirmBtn = screen.getByRole("button", { name: /Confirm swap/i });
    await act(async () => { fireEvent.click(confirmBtn); });
    // Don't flush the submit promise — dialog should stay mounted while busy
    await act(async () => {});

    // Dialog still visible (busy keeps it mounted per spec)
    expect(screen.queryByRole("dialog", { name: /Surgeon replacement pool/i })).toBeTruthy();
    // Confirm button should show operating state
    const operatingBtn = screen.getByRole("button", { name: /Operating/i });
    expect(operatingBtn).toBeTruthy();
    expect((operatingBtn as HTMLButtonElement).disabled).toBe(true);

    // Resolve the promise so the test cleans up without leaking async work
    await act(async () => {
      resolveSubmit({ ok: true, json: async () => makeSubmitResponse() } as Response);
    });
    await act(async () => {});
  });

  it("after a successful submit, the dialog closes and the reveal is shown", async () => {
    renderGame();
    await reachSurgeonDialog();

    const inRadios = screen.getAllByRole("radio", { name: /Reggie Miller/i });
    await act(async () => { fireEvent.click(inRadios[0]); });
    await act(async () => {});

    const outGroup = screen.getByRole("radiogroup", { name: /Player to swap out/i });
    const eligibleBtns = Array.from(outGroup.querySelectorAll<HTMLElement>("[role=radio]:not([aria-disabled=true])"));
    await act(async () => { fireEvent.click(eligibleBtns[0]); });
    await act(async () => {});

    const confirmBtn = screen.getByRole("button", { name: /Confirm swap/i });
    await act(async () => { fireEvent.click(confirmBtn); });
    await act(async () => {});
    await act(async () => {});

    // Dialog is gone
    expect(screen.queryByRole("dialog", { name: /Surgeon replacement pool/i })).toBeNull();
    // Surgeon result component is rendered (we mocked it with a data-testid)
    expect(screen.queryByTestId("surgeon-result")).toBeTruthy();
  });
});
