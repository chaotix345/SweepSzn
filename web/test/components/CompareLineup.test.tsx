// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({ getUid: () => "uid-x" }));

import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import { CompareLineup } from "@/components/game/CompareLineup";
import type { Player, LineupResult } from "@/lib/types";

function makePlayers(): Player[] {
  return ["PG", "SG", "SF", "PF", "C"].map((pos, i) => ({
    id: `p${i}`, name: `Player ${pos}`, year: 1990 + i, decade: "1990s", tier: "complete",
    team: "CHI", pos: pos as Player["pos"], z: { pts: 2 - i * 0.2, trb: 1, ast: 1, stl: 0.5, blk: 0.5, ts: 1 },
  }));
}
function makeResult(o: Partial<LineupResult> = {}): LineupResult {
  return {
    ortg: 112.5, drtg: 108.3, netRtg: 4.2, wins: 55, losses: 27, winPct: 0.671,
    grade: "B", label: "CONTENDER", factors: [], players: [], notes: [], ...o,
  };
}

const setup = () =>
  render(<CompareLineup players={makePlayers()} result={makeResult()} lineupSeg="p0,p1,p2,p3,p4" />);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("CompareLineup — post-game compare (vs real team / vs friend)", () => {
  it("opens a dialog from the compare CTA", () => {
    const { container, getByRole } = setup();
    fireEvent.click(getByRole("button", { name: /compare your lineup/i }));
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("vs Real Team: shows the matched famous team's actual ratings beside your five", () => {
    const { container, getByRole } = setup();
    fireEvent.click(getByRole("button", { name: /compare your lineup/i }));
    // 55 wins → matched anchor is the 58-24 Spurs (DRtg 101.6 — unique to the real-team block)
    expect(container.textContent).toContain("101.6");
    expect(container.textContent).toMatch(/Spurs/);
  });

  it("vs Friend: pasting a link fetches their five and renders their record + a shared radar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        players: makePlayers(),
        result: makeResult({ wins: 70, losses: 12, grade: "A+", label: "HISTORIC", ortg: 118, drtg: 100, netRtg: 18 }),
        hinted: false, prime: false, blueprint: null,
      }),
    }) as unknown as typeof fetch));
    const { container, getByRole, getByPlaceholderText } = setup();
    fireEvent.click(getByRole("button", { name: /compare your lineup/i }));
    fireEvent.click(getByRole("button", { name: /vs a friend/i }));
    fireEvent.change(getByPlaceholderText(/paste/i), { target: { value: "https://sweepszn.com/r/x,y,z,w,v" } });
    fireEvent.click(getByRole("button", { name: /compare with friend/i }));
    await waitFor(() => expect(container.textContent).toContain("70")); // their wins
    expect(container.querySelector('svg[role="img"]')).toBeTruthy(); // the shared z-radar
    // a share-this-matchup link to the /compare SSR route
    const share = container.querySelector('a[href^="/compare/p0,p1,p2,p3,p4/"]');
    expect(share).toBeTruthy();
  });

  it("fires a compare_open analytics event when the compare CTA opens (the friend loop is a growth surface)", () => {
    const { getByRole } = setup();
    fireEvent.click(getByRole("button", { name: /compare your lineup/i }));
    expect(track).toHaveBeenCalledWith("compare_open", expect.objectContaining({ grade: expect.any(String), wins: expect.any(Number) }));
    expect(ev).toHaveBeenCalledWith("compare_open", { uid: "uid-x" });
  });

  it("fires a compare_friend event when a friend's five resolves", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        players: makePlayers(),
        result: makeResult({ wins: 70, losses: 12 }),
        hinted: false, prime: false, blueprint: null,
      }),
    }) as unknown as typeof fetch));
    const { getByRole, getByPlaceholderText } = setup();
    fireEvent.click(getByRole("button", { name: /compare your lineup/i }));
    fireEvent.click(getByRole("button", { name: /vs a friend/i }));
    fireEvent.change(getByPlaceholderText(/paste/i), { target: { value: "https://sweepszn.com/r/x,y,z,w,v" } });
    fireEvent.click(getByRole("button", { name: /compare with friend/i }));
    await waitFor(() => expect(track).toHaveBeenCalledWith("compare_friend", expect.objectContaining({ your_grade: expect.any(String), friend_grade: expect.any(String) })));
    expect(ev).toHaveBeenCalledWith("compare_friend", { uid: "uid-x" });
  });

  it("vs Friend: surfaces an error when the link does not resolve", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as typeof fetch));
    const { container, getByRole, getByPlaceholderText } = setup();
    fireEvent.click(getByRole("button", { name: /compare your lineup/i }));
    fireEvent.click(getByRole("button", { name: /vs a friend/i }));
    fireEvent.change(getByPlaceholderText(/paste/i), { target: { value: "/r/bogus" } });
    fireEvent.click(getByRole("button", { name: /compare with friend/i }));
    await waitFor(() => expect(container.textContent).toMatch(/couldn.t|not find|invalid/i));
  });
});

describe("CompareLineup — dialog focus (F20)", () => {
  it("moves focus into the dialog, traps Tab, closes on Escape and returns focus to the trigger", () => {
    const { getByRole, container } = setup();
    const trigger = getByRole("button", { name: /compare your lineup/i });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = getByRole("dialog", { name: /compare lineup/i });
    expect(document.activeElement).toBe(dialog);
    const focusables = dialog.querySelectorAll<HTMLElement>("button:not([disabled]), select, input, a[href]");
    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a backdrop tap but not on a tap inside the panel", () => {
    const { getByRole, container } = setup();
    fireEvent.click(getByRole("button", { name: /compare your lineup/i }));
    const dialog = getByRole("dialog", { name: /compare lineup/i });
    fireEvent.click(dialog);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    fireEvent.click(dialog.parentElement!);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
