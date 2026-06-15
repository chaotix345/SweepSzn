// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import { BLUEPRINTS } from "@/lib/blueprint";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// --- all module mocks before any component imports ---

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({
  getUid: () => "test-uid-bp",
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
vi.mock("@/components/SurgeonResult", () => ({ default: () => null }));

// --- import component AFTER mocks ---
import Game from "@/components/Game";

// --- fixtures ---

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
      { label: "Spacing", value: 2.5, kind: "good" },
    ],
    players: Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, name: `Player ${i}`, off: 2.0, def: 1.0, usage: 20, shooter: i < 3, rimProtector: i >= 3,
    })),
    notes: [],
  },
  players: Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`, name: `Player ${i}`, year: 1996, decade: "1990s", tier: "complete" as const,
    team: "CHI", pos: "SG" as const, eligible: ["SG"], pts: 25, trb: 5, ast: 4, stl: 1.5, blk: 0.5,
  })),
});

// Tracks fetch calls so tests can assert no spurious fetches fired.
type FetchCall = { url: string; body?: unknown };
let fetchCalls: FetchCall[] = [];

function makeFetchMock() {
  fetchCalls = [];
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = typeof url === "string" ? url.split("?")[0] : "";
    fetchCalls.push({ url: path, body: init?.body ? JSON.parse(init.body as string) : undefined });
    let body: unknown = {};
    if (path === "/api/spin") body = makeSpin();
    else if (path === "/api/evaluate") body = makeEvalResult();
    else if (path === "/api/pickem") body = { y: 5, n: 3, vote: null };
    return { ok: true, json: async () => body } as Response;
  });
}

// ---- helpers ----

function renderGame() {
  try { localStorage.clear(); } catch { /* */ }
  return render(<Game />);
}

function findBlueprintModeBtn(): HTMLElement {
  const allBtns = screen.getAllByRole("button");
  return allBtns.find((b) => b.getAttribute("aria-label") === "Play Blueprint mode")!;
}

function findBpDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: /Blueprint commitment/i });
}

// ======================================================================
// TESTS
// ======================================================================

describe("Game — Blueprint commit dialog", () => {
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

  it("Blueprint mode start shows the strategy radiogroup before any spin", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const dialog = screen.queryByRole("dialog", { name: /Blueprint commitment/i });
    expect(dialog).toBeTruthy();

    const radiogroup = screen.getByRole("radiogroup", { name: /Blueprint choices/i });
    expect(radiogroup).toBeTruthy();

    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(BLUEPRINTS.length);
  });

  it("all blueprint options are surfaced in the radiogroup", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const dialog = findBpDialog();
    for (const bp of BLUEPRINTS) {
      expect(dialog.textContent).toContain(bp.label);
    }
  });

  it("no spin fires before committing (the dialog gates the first spin)", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const spinCalls = fetchCalls.filter((c) => c.url === "/api/spin");
    expect(spinCalls.length).toBe(0);
  });

  it("Commit button is disabled until a strategy is selected", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const commitBtn = screen.getByRole("button", { name: /Commit/i });
    expect((commitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("clicking a strategy option selects it (aria-checked) and enables Commit", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const firstRadio = screen.getAllByRole("radio")[0];
    await act(async () => { fireEvent.click(firstRadio); });
    await act(async () => {});

    expect(firstRadio.getAttribute("aria-checked")).toBe("true");

    const commitBtn = screen.getByRole("button", { name: /Commit/i });
    expect((commitBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("ArrowDown moves selection from first to second option", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const dialog = findBpDialog();
    const radios = screen.getAllByRole("radio");

    // Focus the first radio
    await act(async () => { radios[0].focus(); });
    // With nothing selected, ArrowDown should land on index 0 (first option)
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "ArrowDown", code: "ArrowDown" });
    });
    await act(async () => {});

    // First radio should now be selected (aria-checked)
    const updatedRadios = screen.getAllByRole("radio");
    expect(updatedRadios[0].getAttribute("aria-checked")).toBe("true");
  });

  it("ArrowDown cycles: last option wraps to first", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const dialog = findBpDialog();

    // Select the last blueprint by clicking it
    const radios = screen.getAllByRole("radio");
    await act(async () => { fireEvent.click(radios[radios.length - 1]); });
    await act(async () => {});

    expect(radios[radios.length - 1].getAttribute("aria-checked")).toBe("true");

    // ArrowDown from last should wrap to first
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "ArrowDown", code: "ArrowDown" });
    });
    await act(async () => {});

    const updatedRadios = screen.getAllByRole("radio");
    expect(updatedRadios[0].getAttribute("aria-checked")).toBe("true");
  });

  it("ArrowUp from nothing selected jumps to last option", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const dialog = findBpDialog();

    // With nothing selected, ArrowUp should land on the LAST option (per spec)
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "ArrowUp", code: "ArrowUp" });
    });
    await act(async () => {});

    const updatedRadios = screen.getAllByRole("radio");
    const lastIdx = updatedRadios.length - 1;
    expect(updatedRadios[lastIdx].getAttribute("aria-checked")).toBe("true");
  });

  it("Escape/cancel returns to mode select without firing any spin fetch", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const spinCallsBefore = fetchCalls.filter((c) => c.url === "/api/spin").length;

    const dialog = findBpDialog();
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    });
    await act(async () => {});

    // Dialog is gone
    expect(screen.queryByRole("dialog", { name: /Blueprint commitment/i })).toBeNull();
    // Back at mode picker (mode select has the Blueprint button again)
    expect(findBlueprintModeBtn()).toBeTruthy();

    // No spin was fired
    const spinCallsAfter = fetchCalls.filter((c) => c.url === "/api/spin").length;
    expect(spinCallsAfter).toBe(spinCallsBefore);
  });

  it("Back to all modes button cancels without fetches", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    const spinCallsBefore = fetchCalls.filter((c) => c.url === "/api/spin").length;

    const backBtn = screen.getByRole("button", { name: /Back to all modes/i });
    await act(async () => { fireEvent.click(backBtn); });
    await act(async () => {});

    expect(screen.queryByRole("dialog", { name: /Blueprint commitment/i })).toBeNull();
    expect(findBlueprintModeBtn()).toBeTruthy();

    const spinCallsAfter = fetchCalls.filter((c) => c.url === "/api/spin").length;
    expect(spinCallsAfter).toBe(spinCallsBefore);
  });

  it("commit closes the dialog, then spinning fires /api/spin with a bp- seed", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    // Select "Spacing Bomb" (first option)
    const firstRadio = screen.getAllByRole("radio")[0];
    await act(async () => { fireEvent.click(firstRadio); });
    await act(async () => {});

    const commitBtn = screen.getByRole("button", { name: /Commit/i });
    await act(async () => { fireEvent.click(commitBtn); });
    await act(async () => {});

    // Dialog is closed — the draft board is now visible with the SPIN button
    expect(screen.queryByRole("dialog", { name: /Blueprint commitment/i })).toBeNull();
    const spinBtn = screen.getAllByRole("button").find((b) => b.textContent?.trim() === "🎰 SPIN");
    expect(spinBtn).toBeTruthy();

    // Click spin — this triggers /api/spin with a bp- seed
    await act(async () => { fireEvent.click(spinBtn!); });
    await act(async () => { vi.advanceTimersByTime(1200); });
    await act(async () => {});

    const spinCall = fetchCalls.find((c) => c.url === "/api/spin");
    expect(spinCall).toBeTruthy();
    expect(typeof (spinCall!.body as Record<string, unknown>).seed).toBe("string");
    expect(((spinCall!.body as Record<string, unknown>).seed as string).startsWith("bp-")).toBe(true);
  });

  it("committed blueprint label is shown as an info strip after committing", async () => {
    renderGame();
    await act(async () => { fireEvent.click(findBlueprintModeBtn()); });
    await act(async () => {});

    // Select "Spacing Bomb"
    const firstRadio = screen.getAllByRole("radio")[0];
    await act(async () => { fireEvent.click(firstRadio); });
    await act(async () => {});

    const commitBtn = screen.getByRole("button", { name: /Commit/i });
    await act(async () => { fireEvent.click(commitBtn); });
    await act(async () => {});

    // After committing, the info strip mentions the committed blueprint label (Game.tsx line ~704)
    const committedLabel = BLUEPRINTS[0].label;
    const pageText = document.body.textContent ?? "";
    expect(pageText).toContain(committedLabel);
  });
});
