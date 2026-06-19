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
  getUid: () => "test-uid-ux", getName: () => "", setName: vi.fn(),
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
import { markFirstPlay } from "@/lib/firstPlay";

const makeSpin = (team = "CHI", decade = "1990s") => ({
  team, decade,
  candidates: [{
    id: "jordan", name: "Michael Jordan", year: 1996, decade, team,
    pos: "SG", eligible: ["PG", "SG", "SF", "PF", "C"], pts: 30.4, trb: 6.6, ast: 5.9, stl: 2.2, blk: 0.5,
  }],
});

function makeFetchMock() {
  return vi.fn(async (url: string) => {
    const path = typeof url === "string" ? url.split("?")[0] : "";
    let body: unknown = {};
    if (path === "/api/spin") body = makeSpin();
    else if (path === "/api/pickem") body = { y: 5, n: 3, vote: null };
    return { ok: true, json: async () => body } as Response;
  });
}

function findModeBtn(label: string, blurb: string): HTMLElement {
  return screen.getAllByRole("button").find((b) => b.textContent?.includes(label) && b.textContent?.includes(blurb))!;
}
function findSpinBtn(): HTMLElement {
  return screen.getAllByRole("button").find((b) => b.textContent?.trim() === "🎰 SPIN")!;
}
async function spinAndWait(): Promise<void> {
  await act(async () => { fireEvent.click(findSpinBtn()); });
  await act(async () => { vi.advanceTimersByTime(1200); });
  await act(async () => {});
}

describe("Game — usage cap visible from round 1 (R1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", makeFetchMock());
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(async () => {
    await act(async () => {});
    cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
  });

  it("shows the usage budget bar at the first pick (0 placed), not only from round 3", async () => {
    render(<Game />);
    await act(async () => { fireEvent.click(findModeBtn("Classic", "Full stats visible")); });
    await spinAndWait();
    // Zero players placed — under the old `drafted.length >= 2` gate this bar was hidden.
    expect(screen.queryByText(/Usage limit/i)).toBeTruthy();
  });

  it("does not show the usage bar in HoopIQ (blind drafting)", async () => {
    render(<Game />);
    await act(async () => { fireEvent.click(findModeBtn("HoopIQ", "test your ball knowledge")); });
    await spinAndWait();
    expect(screen.queryByText(/Usage limit/i)).toBeNull();
  });
});

describe("Game — first-play funnel signal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", makeFetchMock());
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(async () => {
    await act(async () => {});
    cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
  });

  it("marks the once-per-device first_play signal when a mode starts", async () => {
    render(<Game />);
    await act(async () => { fireEvent.click(findModeBtn("Classic", "Full stats visible")); });
    expect(markFirstPlay).toHaveBeenCalledWith("test-uid-ux", undefined, undefined);
  });
});

describe("Game — ?mode= deep-link past the picker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", makeFetchMock());
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(async () => {
    await act(async () => {});
    cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
    window.history.replaceState({}, "", "/"); // don't leak the deep-link URL into the next test
  });

  it("/play?mode=daily starts the game and skips the mode picker", async () => {
    window.history.replaceState({}, "", "/play?mode=daily");
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Pick your mode/i)).toBeNull();
    expect(findSpinBtn()).toBeTruthy();
    expect(markFirstPlay).toHaveBeenCalledWith("test-uid-ux", undefined, undefined);
  });

  it("strips the ?mode= param after consuming it (a refresh won't restart)", async () => {
    window.history.replaceState({}, "", "/play?mode=classic");
    render(<Game />);
    await act(async () => {});
    expect(window.location.search).toBe("");
  });

  it("/play?mode=challenge falls through to the picker (challenge needs ?c=)", async () => {
    window.history.replaceState({}, "", "/play?mode=challenge");
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Pick your mode/i)).toBeTruthy();
  });

  it("/play?mode=bogus falls through to the picker", async () => {
    window.history.replaceState({}, "", "/play?mode=bogus");
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Pick your mode/i)).toBeTruthy();
  });

  it("a bare /play shows the picker", async () => {
    window.history.replaceState({}, "", "/play");
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Pick your mode/i)).toBeTruthy();
  });

  it("clicking ← Modes from a deep-linked game returns to the picker (the escape hatch)", async () => {
    window.history.replaceState({}, "", "/play?mode=daily");
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Pick your mode/i)).toBeNull(); // started in-game
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /modes/i })); });
    expect(screen.queryByText(/Pick your mode/i)).toBeTruthy(); // back at the wall (discovery preserved)
  });

  it("a fresh ?mode= start drops any coexisting restore params (a refresh won't resurrect them)", async () => {
    window.history.replaceState({}, "", "/play?mode=daily&r=abcde&m=classic");
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Pick your mode/i)).toBeNull(); // daily started — the restore did NOT win
    expect(window.location.search).toBe(""); // r/m stripped, so a later refresh stays clean
  });

  it("a ?mode= deep-link preserves a coexisting utm_source (acquisition attribution survives the strip)", async () => {
    window.history.replaceState({}, "", "/play?mode=daily&utm_source=x_launch");
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Pick your mode/i)).toBeNull(); // daily started past the wall
    expect(window.location.search).toBe("?utm_source=x_launch"); // utm is NOT in the strip list — it survives for the funnel
    // and first_play is attributed to the channel — read straight off the URL so it's robust to the
    // UtmCapture-vs-Game effect ordering (localStorage may not be written yet on a cold deep-link).
    expect(markFirstPlay).toHaveBeenCalledWith("test-uid-ux", "x_launch", undefined);
  });

  it("a ?ref= deep-link forwards the referral code to first_play (friend attribution survives the strip)", async () => {
    window.history.replaceState({}, "", "/play?mode=daily&ref=rabc123def45");
    render(<Game />);
    await act(async () => {});
    expect(screen.queryByText(/Pick your mode/i)).toBeNull(); // daily started past the wall
    expect(markFirstPlay).toHaveBeenCalledWith("test-uid-ux", undefined, "rabc123def45");
  });
});

describe("Game — first-run levers tip (R6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", makeFetchMock());
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(async () => {
    await act(async () => {});
    cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
  });

  it("shows a dismissible scoring tip on the very first game", async () => {
    render(<Game />);
    await act(async () => { fireEvent.click(findModeBtn("Classic", "Full stats visible")); });
    await act(async () => {});
    expect(screen.queryByText(/how your five is scored/i)).toBeTruthy();
  });

  it("dismissing the tip hides it and persists the choice", async () => {
    render(<Game />);
    await act(async () => { fireEvent.click(findModeBtn("Classic", "Full stats visible")); });
    await act(async () => {});
    const gotIt = screen.getAllByRole("button").find((b) => /got it/i.test(b.textContent ?? ""))!;
    await act(async () => { fireEvent.click(gotIt); });
    expect(screen.queryByText(/how your five is scored/i)).toBeNull();
    expect(localStorage.getItem("szn_levers_tip_seen")).toBeTruthy();
  });

  it("does not show the tip once it has been seen before", async () => {
    try { localStorage.setItem("szn_levers_tip_seen", "1"); } catch { /* */ }
    render(<Game />);
    await act(async () => { fireEvent.click(findModeBtn("Classic", "Full stats visible")); });
    await act(async () => {});
    expect(screen.queryByText(/how your five is scored/i)).toBeNull();
  });

  it("does not show the tip in HoopIQ (deliberately sparse, blind drafting)", async () => {
    render(<Game />);
    await act(async () => { fireEvent.click(findModeBtn("HoopIQ", "test your ball knowledge")); });
    await act(async () => {});
    expect(screen.queryByText(/how your five is scored/i)).toBeNull();
  });
});
