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
  getUid: () => "test-uid-game",
  getName: () => "",
  setName: vi.fn(),
  recordDailyDone: vi.fn(),
  getStreak: () => ({ current: 0, longest: 0 }),
  msToNextUtcMidnight: () => 3600000,
}));

// Stub all heavy child components so they don't fire their own fetches
vi.mock("@/components/Leaderboard", () => ({ default: () => null }));
vi.mock("@/components/ChallengeResult", () => ({ default: () => null }));
vi.mock("@/components/ChallengeOwner", () => ({ default: () => null }));
vi.mock("@/components/ResultsHistory", () => ({ default: () => null }));
vi.mock("@/components/FhLeaderboard", () => ({ default: () => null }));
vi.mock("@/components/GoogleOneTap", () => ({ default: () => null }));
vi.mock("@/components/RankShareButton", () => ({ default: () => null }));

// --- import component AFTER mocks ---
import Game from "@/components/Game";

// --- deterministic spin fixture ---
const makeSpin = (team = "CHI", decade = "1990s") => ({
  team,
  decade,
  candidates: [
    {
      id: "jordan", name: "Michael Jordan", year: 1996, decade, team,
      pos: "SG", eligible: ["PG", "SG", "SF", "PF", "C"],
      pts: 30.4, trb: 6.6, ast: 5.9, stl: 2.2, blk: 0.5,
    },
  ],
});

const makeEvalResult = () => ({
  result: {
    ortg: 115.0, drtg: 105.0, netRtg: 10.0, wins: 70, losses: 12,
    winPct: 0.854, grade: "S", label: "Dynasty",
    factors: [
      { label: "Star offense", value: 8.0, kind: "good" },
      { label: "Spacing", value: -1.0, kind: "bad" },
    ],
    players: Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, name: `Player ${i}`, off: 2.0, def: 1.0, usage: 20, shooter: true, rimProtector: false,
    })),
    notes: [],
  },
  players: Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`, name: `Player ${i}`, year: 1996, decade: "1990s", tier: "complete" as const,
    team: "CHI", pos: "SG" as const, eligible: ["SG"], pts: 25, trb: 5, ast: 4, stl: 1.5, blk: 0.5,
  })),
});

const makeFhChoices = () => ({
  ask: "worst",
  choices: ["Spacing", "No rim protection", "Usage overload", "Star defense"],
  answer: "Spacing",
});

function makeFetchMock() {
  return vi.fn(async (url: string) => {
    const path = typeof url === "string" ? url.split("?")[0] : "";
    let body: unknown = {};
    if (path === "/api/spin") body = makeSpin();
    else if (path === "/api/evaluate") body = makeEvalResult();
    else if (path === "/api/pickem") body = { y: 5, n: 3, vote: null };
    else if (path === "/api/factorhunt/choices") body = makeFhChoices();
    // /api/auth/me and others → {} (silenced)
    return { ok: true, json: async () => body } as Response;
  });
}

// ---- helpers ----

function renderGame() {
  try { localStorage.clear(); } catch { /* */ }
  return render(<Game />);
}

function findDailyModeBtn(): HTMLElement {
  const allBtns = screen.getAllByRole("button");
  return allBtns.find((b) => b.textContent?.includes("Daily") && b.textContent?.includes("Everyone gets the same spins"))!;
}

function findFhModeBtn(): HTMLElement {
  const allBtns = screen.getAllByRole("button");
  return allBtns.find((b) => b.textContent?.includes("Factor Hunt") && b.textContent?.includes("predict WHY"))!;
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

// Reach the Pick'Em overlay: pick Daily, spin once.
async function reachPickemDialog(): Promise<void> {
  await act(async () => { fireEvent.click(findDailyModeBtn()); });
  await spinAndWait();
}

// Reach the FH prediction dialog: pick Factor Hunt, spin+place 5 times.
async function reachFhDialog(): Promise<void> {
  await act(async () => { fireEvent.click(findFhModeBtn()); });

  for (const slot of ["PG", "SG", "SF", "PF", "C"] as const) {
    await spinAndWait();

    // Select the only candidate available
    const candidateBtns = screen.getAllByRole("button", { name: /Select Michael Jordan/i });
    await act(async () => { fireEvent.click(candidateBtns[0]); });

    // Place on the court slot — when selPlayer is set, aria-label becomes "PG slot, eligible — tap to place"
    // or "PG slot (empty)" when no player is selected. Match both.
    const slotBtn = screen.getAllByRole("button").find(
      (b) => {
        const lbl = b.getAttribute("aria-label") ?? "";
        return lbl.startsWith(`${slot} slot`) && (lbl.includes("empty") || lbl.includes("eligible"));
      }
    );
    if (slotBtn) {
      await act(async () => { fireEvent.click(slotBtn); });
    } else {
      // fallback: click via the court aria-label text
      const allBtns = screen.getAllByRole("button");
      const fallback = allBtns.find((b) => b.getAttribute("aria-label")?.startsWith(slot));
      if (fallback) await act(async () => { fireEvent.click(fallback); });
    }
    await act(async () => {});
  }

  // After 5 picks, beginFhPrediction fires fetch(/api/factorhunt/choices).
  // Wait for the promise to resolve and setState to fire.
  await act(async () => {});
  await act(async () => {});
}

// ======================================================================
// TESTS
// ======================================================================

describe("Game — Pick'Em overlay focus trap", () => {
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
  });

  it("Pick'Em dialog appears after first spin in Daily mode", async () => {
    renderGame();
    await reachPickemDialog();

    const dialog = screen.queryByRole("dialog", { name: /Pick'Em crowd vote/i });
    expect(dialog).toBeTruthy();
  });

  it("Pick'Em: Tab from last focusable wraps to first (forward containment)", async () => {
    renderGame();
    await reachPickemDialog();

    const dialog = screen.getByRole("dialog", { name: /Pick'Em crowd vote/i });
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled])"));
    expect(buttons.length).toBeGreaterThan(1);

    // Focus the last button, then fire Tab — the onKeyDown trap should wrap to first
    await act(async () => { buttons[buttons.length - 1].focus(); });
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false, bubbles: true });
    await act(async () => {});

    expect(document.activeElement).toBe(buttons[0]);
  });

  it("Pick'Em: Shift+Tab from first focusable wraps to last (backward containment)", async () => {
    renderGame();
    await reachPickemDialog();

    const dialog = screen.getByRole("dialog", { name: /Pick'Em crowd vote/i });
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled])"));
    expect(buttons.length).toBeGreaterThan(1);

    // Focus the first button, then fire Shift+Tab — should wrap to last
    await act(async () => { buttons[0].focus(); });
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true, bubbles: true });
    await act(async () => {});

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("Pick'Em: Escape dismisses the overlay", async () => {
    renderGame();
    await reachPickemDialog();

    const dialog = screen.getByRole("dialog", { name: /Pick'Em crowd vote/i });
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    });
    await act(async () => {});

    expect(screen.queryByRole("dialog", { name: /Pick'Em crowd vote/i })).toBeNull();
  });
});

describe("Game — Factor Hunt prediction dialog focus trap", () => {
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
  });

  it("FH prediction dialog appears after filling all 5 slots in Factor Hunt mode", async () => {
    renderGame();
    await reachFhDialog();

    const dialog = screen.queryByRole("dialog", { name: /Factor Hunt prediction/i });
    expect(dialog).toBeTruthy();
  });

  it("FH: Tab from last focusable wraps to first (forward containment)", async () => {
    renderGame();
    await reachFhDialog();

    const dialog = screen.getByRole("dialog", { name: /Factor Hunt prediction/i });
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled])"));
    expect(buttons.length).toBeGreaterThan(1);

    await act(async () => { buttons[buttons.length - 1].focus(); });
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false, bubbles: true });
    await act(async () => {});

    expect(document.activeElement).toBe(buttons[0]);
  });

  it("FH: Shift+Tab from first focusable wraps to last (backward containment)", async () => {
    renderGame();
    await reachFhDialog();

    const dialog = screen.getByRole("dialog", { name: /Factor Hunt prediction/i });
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled])"));
    expect(buttons.length).toBeGreaterThan(1);

    await act(async () => { buttons[0].focus(); });
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true, bubbles: true });
    await act(async () => {});

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("FH: Escape dismisses the dialog (calls lockFh(null) → simulate fires)", async () => {
    renderGame();
    await reachFhDialog();

    const dialog = screen.getByRole("dialog", { name: /Factor Hunt prediction/i });
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    });
    await act(async () => {});

    expect(screen.queryByRole("dialog", { name: /Factor Hunt prediction/i })).toBeNull();
  });
});
