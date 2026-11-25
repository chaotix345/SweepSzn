// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));
vi.mock("@/components/SessionProvider", () => ({ useSessionContext: () => ({ user: null }) }));
vi.mock("@/lib/account", () => ({ fetchProfile: vi.fn(async () => null) }));
vi.mock("@/lib/resultHistory", () => ({ listResults: vi.fn(() => []) }));

import { ModeSelect } from "@/components/game/ModeSelect";
import { listResults } from "@/lib/resultHistory";

const mockList = vi.mocked(listResults);
beforeEach(() => { mockList.mockReturnValue([]); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("ModeSelect", () => {
  it("features Daily as the recommended start and renders all eight modes (four behind More modes)", () => {
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(screen.getByText(/start here/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /more modes/i }));
    for (const name of ["Daily", "Classic", "HoopIQ", "Factor Hunt", "Prime Draft", "Blueprint", "Surgeon", "Challenge a Friend"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("surfaces the 80-2 competitive target in the subhead for cold /play arrivals (§12-safe public fact)", () => {
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(screen.getByText(/80-2/)).toBeTruthy();
  });

  it("renders every 'Play →' CTA in the action orange — never a mode accent (DESIGN.md: orange is the only CTA color)", () => {
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /more modes/i }));
    const ctas = screen.getAllByText("Play →");
    expect(ctas.length).toBeGreaterThanOrEqual(7); // 6 discipline tiles + the Challenge invite
    for (const el of ctas) {
      expect(el.className).toContain("text-orange-400");
      expect(el.className).not.toMatch(/text-(violet|cyan|rose)-400/);
    }
  });

  it("calls onPick with the right mode id when a card is clicked", () => {
    const onPick = vi.fn();
    render(<ModeSelect onPick={onPick} onOpenChallenge={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Play Daily mode/i));
    expect(onPick).toHaveBeenCalledWith("daily");
    fireEvent.click(screen.getByRole("button", { name: /more modes/i }));
    fireEvent.click(screen.getByLabelText("Play Surgeon mode"));
    expect(onPick).toHaveBeenCalledWith("surgeon");
    fireEvent.click(screen.getByLabelText("Challenge a friend"));
    expect(onPick).toHaveBeenCalledWith("challenge");
  });

  it("shows first-run orientation when unseen and hides + remembers it on dismiss", () => {
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(screen.getByText(/New here/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(/New here/i)).toBeNull();
    expect(localStorage.getItem("sweepszn_seen_modes")).toBe("1");
  });

  it("flips the Daily tile to 'view result' (not re-pick) when today's Daily was already played", async () => {
    // The risky logic is the dayUTC(entry.ts) === dayUTC() detection — a wrong field name or date
    // compare would leave the tile saying "Play Daily" and deep-link to a 404. Assert the flip.
    mockList.mockReturnValue([{ encoded: "abc123", mode: "daily", wins: 50, losses: 10, grade: "A", ts: Date.now() }]);
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(await screen.findByLabelText(/View today's Daily result/i)).toBeTruthy();
    expect(screen.getByText(/View today's result/i)).toBeTruthy();
    expect(screen.queryByText(/start here/i)).toBeNull(); // no longer the cold-start CTA
  });

  it("links the played-today Daily tile to its /r/ result client-side (a Link, not location.assign)", async () => {
    mockList.mockReturnValue([{ encoded: "abc123", mode: "daily", wins: 50, losses: 10, grade: "A", ts: Date.now() }]);
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    const tile = await screen.findByLabelText(/View today's Daily result/i);
    expect(tile.tagName).toBe("A");
    expect(tile.getAttribute("href")).toBe("/r/abc123");
  });

  it("does NOT flip the Daily tile for a Daily played on a previous day", async () => {
    mockList.mockReturnValue([{ encoded: "old", mode: "daily", wins: 50, losses: 10, grade: "A", ts: Date.now() - 2 * 86_400_000 }]);
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(await screen.findByText(/start here/i)).toBeTruthy(); // yesterday's daily doesn't count
    expect(screen.queryByText(/View today's result/i)).toBeNull();
  });

  it("offers a 'Play X again' shortcut for the most recent solo mode", async () => {
    mockList.mockReturnValue([{ encoded: "def456", mode: "classic", wins: 64, losses: 18, grade: "B", ts: Date.now() }]);
    const onPick = vi.fn();
    render(<ModeSelect onPick={onPick} onOpenChallenge={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Play Classic again/i }));
    expect(onPick).toHaveBeenCalledWith("classic");
  });

  // W1 sharper core: Daily, Classic, Prime and the Challenge bar are top level; the four niche modes
  // live in a collapsed "More modes" drawer whose open state is remembered per viewer.
  it("keeps Surgeon, Blueprint, Factor Hunt and HoopIQ in a collapsed More modes drawer", () => {
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    for (const name of ["Daily", "Classic", "Prime Draft", "Challenge a Friend"]) expect(screen.getByText(name)).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /more modes/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    for (const name of ["Surgeon", "Blueprint", "Factor Hunt", "HoopIQ"]) expect(screen.queryByText(name)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    for (const name of ["Surgeon", "Blueprint", "Factor Hunt", "HoopIQ"]) expect(screen.getByText(name)).toBeTruthy();
  });

  it("remembers the drawer state across visits", async () => {
    const first = render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /more modes/i }));
    first.unmount();
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(await screen.findByText("Surgeon")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /more modes/i })); // close → remembered closed
    expect(screen.queryByText("Surgeon")).toBeNull();
  });

  it("still works when storage throws (private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /more modes/i }));
    expect(screen.getByText("Surgeon")).toBeTruthy();
  });

  it("puts Draft Duel at the top level right after Daily (not in the drawer) and starts it", () => {
    const onPick = vi.fn();
    render(<ModeSelect onPick={onPick} onOpenChallenge={() => {}} />);
    const daily = screen.getByLabelText(/Play Daily mode/i);
    const duel = screen.getByLabelText("Play Draft Duel mode");
    expect(daily.compareDocumentPosition(duel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(duel.closest("#more-modes-panel")).toBeNull();
    expect(duel.compareDocumentPosition(screen.getByLabelText("Play Classic mode")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(duel);
    expect(onPick).toHaveBeenCalledWith("duel");
  });

  it("offers 'Play Draft Duel again' when a duel was the last solo game", async () => {
    mockList.mockReturnValue([{ encoded: "do~a,b,c,d,e.f,g,h,i,j", mode: "duel", wins: 50, losses: 32, grade: "B", ts: Date.now(), outcome: "w" }]);
    const onPick = vi.fn();
    render(<ModeSelect onPick={onPick} onOpenChallenge={() => {}} />);
    fireEvent.click(await screen.findByText(/Play Draft Duel again/));
    expect(onPick).toHaveBeenCalledWith("duel");
  });
});
