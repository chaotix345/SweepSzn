// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
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
  it("features Daily as the recommended start and renders all eight modes", () => {
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(screen.getByText(/start here/i)).toBeTruthy();
    for (const name of ["Daily", "Classic", "HoopIQ", "Factor Hunt", "Prime Draft", "Blueprint", "Surgeon", "Challenge a Friend"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("calls onPick with the right mode id when a card is clicked", () => {
    const onPick = vi.fn();
    render(<ModeSelect onPick={onPick} onOpenChallenge={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Play Daily mode/i));
    expect(onPick).toHaveBeenCalledWith("daily");
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
});
