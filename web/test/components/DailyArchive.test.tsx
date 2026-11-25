// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const reveals: Record<string, unknown>[] = [];
vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className, ...rest }, children),
}));
vi.mock("@/components/CeilingReveal", () => ({ default: (p: Record<string, unknown>) => { reveals.push(p); return React.createElement("div", { "data-testid": "reveal" }); } }));

import DailyArchive from "@/components/DailyArchive";
import { saveArchiveRun } from "@/lib/archiveHistory";
import { saveResult } from "@/lib/resultHistory";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const settle = async () => { await act(async () => {}); await act(async () => {}); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  localStorage.clear(); reveals.length = 0;
  window.history.replaceState({}, "", "/archive");
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("DailyArchive (W3)", () => {
  it("lists yesterday back to the first Daily, newest first, in pages, with unranked play links", async () => {
    render(<DailyArchive />);
    await settle();
    const plays = screen.getAllByRole("link", { name: /^Play the Daily for/ });
    expect(plays).toHaveLength(31);
    expect(plays[0].getAttribute("href")).toBe("/play?mode=daily&date=2026-11-25");
    expect(screen.queryByRole("link", { name: /Wed, Nov 26/ })).toBeNull(); // today is not in the archive
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(screen.getByTestId("archive-count").textContent).toBe("0 of 173 played on this device");
    fireEvent.click(screen.getByText("Show older days"));
    fireEvent.click(screen.getByText("Show older days"));
    fireEvent.click(screen.getByText("Show older days"));
    const all = screen.getAllByRole("link", { name: /Daily for/ });
    expect(all).toHaveLength(173);
    expect(all.at(-1)!.getAttribute("href")).toBe("/play?mode=daily&date=2026-6-6");
    expect(screen.queryByText("Show older days")).toBeNull();
  });

  it("marks days played on the day and replays, and filters by them", async () => {
    vi.setSystemTime(Date.parse("2026-11-24T15:00:00Z"));
    saveResult({ encoded: "x", mode: "daily", wins: 61, losses: 21, grade: "B" });
    vi.setSystemTime(NOW);
    saveArchiveRun("2026-11-20", { wins: 58, losses: 24, grade: "B", encoded: "y" });
    render(<DailyArchive />);
    await settle();
    expect(screen.getByTestId("archive-count").textContent).toBe("2 of 173 played on this device");
    expect(screen.getByRole("link", { name: "Replay the Daily for Tue, Nov 24" })).toBeTruthy();
    expect(screen.getByText(/· 61-21/)).toBeTruthy();
    expect(screen.getByText("Replay · 58-24")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Played" }));
    expect(screen.getAllByRole("link", { name: /Daily for/ }).map((a) => a.getAttribute("href"))).toEqual([
      "/play?mode=daily&date=2026-11-24", "/play?mode=daily&date=2026-11-20",
    ]);
    fireEvent.click(screen.getByRole("tab", { name: "Not played" }));
    expect(screen.queryByRole("link", { name: /Tue, Nov 24/ })).toBeNull();
  });

  it("reveals a day's perfect five on demand, with the player's best result for it", async () => {
    saveArchiveRun("2026-11-20", { wins: 58, losses: 24, grade: "B", encoded: "y" });
    render(<DailyArchive />);
    await settle();
    expect(screen.queryByTestId("reveal")).toBeNull();
    const toggles = screen.getAllByRole("button", { name: /Perfect five/ });
    fireEvent.click(toggles[5]); // Nov 20
    expect(reveals.at(-1)).toEqual({ date: "2026-11-20", yourWins: 58 });
    fireEvent.click(toggles[0]); // Nov 25, unplayed: spoiler note
    expect(reveals.at(-1)).toEqual({ date: "2026-11-25", yourWins: undefined });
    expect(screen.getByText(/Spoiler/)).toBeTruthy();
  });

  it("opens the ?d= day (from the Daily result's yesterday link), even past the first page", async () => {
    window.history.replaceState({}, "", "/archive?d=2026-7-1");
    render(<DailyArchive />);
    await settle();
    expect(reveals.at(-1)).toMatchObject({ date: "2026-7-1" });
    expect(screen.getByRole("button", { name: /Perfect five/, expanded: true })).toBeTruthy();
  });
});
