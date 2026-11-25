// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { Browser } from "@/components/game/browser";
import type { DraftCandidate } from "@/lib/types";

afterEach(() => cleanup());

const cand = (over: Partial<DraftCandidate> & { id: string; name: string }): DraftCandidate => ({
  year: 2000, decade: "2000s", team: "CHI", pos: "SG", eligible: ["PG", "SG", "SF", "PF", "C"],
  pts: 0, trb: 0, ast: 0, stl: 0, blk: 0, ...over,
} as DraftCandidate);

const baseProps = {
  mode: "classic" as const, selId: null, hintsLeft: 2,
  onReveal: () => {}, canPlace: () => true, onSelect: () => {},
};

describe("Browser — default 'Top' sort ranks by server rank (R8)", () => {
  it("defaults to server rank order, not PPG / A–Z / input order", () => {
    // Adam: top scorer, alphabetically first, listed first — but rank 1.
    // Zane: low scorer, alphabetically last, listed second — but rank 0 (best).
    // A–Z, PPG, and input order all put Adam first; ONLY rank order puts Zane first.
    const spin = { team: "CHI", decade: "2000s", candidates: [
      cand({ id: "a", name: "Adam Aaronson", pts: 30, rank: 1 }),
      cand({ id: "z", name: "Zane Zykov", pts: 10, rank: 0 }),
    ] };
    render(<Browser spin={spin} {...baseProps} />);
    const rows = screen.getAllByRole("button", { name: /^Select / });
    expect(rows[0].getAttribute("aria-label")).toContain("Zane Zykov");      // rank 0 wins
    expect(rows[1].getAttribute("aria-label")).toContain("Adam Aaronson");
  });
});

describe("Browser — sort options", () => {
  const spin = { team: "CHI", decade: "2000s", candidates: [
    cand({ id: "a", name: "Adam Aaronson", pts: 30, trb: 5, rank: 1 }),
    cand({ id: "z", name: "Zane Zykov", pts: 10, trb: 12, rank: 0 }),
  ] };
  const order = () =>
    screen.getAllByRole("button", { name: /^Select / }).map((r) => r.getAttribute("aria-label"));

  it("'Top' (default) orders by rank", () => {
    render(<Browser spin={spin} {...baseProps} />);
    expect(order()[0]).toContain("Zane Zykov"); // rank 0, despite lower PPG and later alphabetically
  });

  it("PPG sorts by points descending when selected", async () => {
    const user = userEvent.setup();
    render(<Browser spin={spin} {...baseProps} />);
    await user.selectOptions(screen.getByLabelText("Sort players"), "ppg");
    expect(order()[0]).toContain("Adam Aaronson"); // 30 > 10
  });

  it("A–Z sorts alphabetically when selected", async () => {
    const user = userEvent.setup();
    render(<Browser spin={spin} {...baseProps} />);
    await user.selectOptions(screen.getByLabelText("Sort players"), "az");
    expect(order()[0]).toContain("Adam Aaronson"); // Aaronson < Zykov
  });

  it("'Top' sinks candidates missing a rank to the bottom", () => {
    const noRankSpin = { team: "CHI", decade: "2000s", candidates: [
      cand({ id: "u", name: "Unranked Ualson" }),   // no rank -> MAX_SAFE_INTEGER, sinks
      cand({ id: "z", name: "Zane Zykov", rank: 0 }),
    ] };
    render(<Browser spin={noRankSpin} {...baseProps} />);
    const rows = screen.getAllByRole("button", { name: /^Select / });
    expect(rows[0].getAttribute("aria-label")).toContain("Zane Zykov");      // rank 0 first
    expect(rows[1].getAttribute("aria-label")).toContain("Unranked Ualson"); // no rank last
  });
});

describe("Browser — era-adjustment disclosure at draft (R4)", () => {
  it("flags pre-1985 era spins with a discount tooltip", () => {
    const spin = { team: "BOS", decade: "1970s", candidates: [cand({ id: "a", name: "A", decade: "1970s", year: 1972 })] };
    render(<Browser spin={spin} {...baseProps} />);
    expect(screen.queryByTitle(/discount|era-adjust|before 1985/i)).toBeTruthy();
  });

  it("does not flag modern era spins", () => {
    const spin = { team: "CHI", decade: "2000s", candidates: [cand({ id: "a", name: "A", decade: "2000s", year: 2004 })] };
    render(<Browser spin={spin} {...baseProps} />);
    expect(screen.queryByTitle(/discount|era-adjust|before 1985/i)).toBeNull();
  });

  it("flags a pre-1985 player's decade in Prime (per-row)", () => {
    const spin = { team: "CHI", decade: "PRIME", candidates: [cand({ id: "a", name: "A", decade: "1960s", year: 1962 })] };
    render(<Browser spin={spin} {...baseProps} mode={"prime" as const} />);
    expect(screen.queryAllByTitle(/discount|era-adjust|before 1985/i).length).toBeGreaterThan(0);
  });
});

describe("Browser — F23 era legend and long pools", () => {
  it("states the era-adjustment rule as visible text (not only a hover tooltip)", () => {
    const spin = { team: "BOS", decade: "1970s", candidates: [cand({ id: "a", name: "A", decade: "1970s", year: 1972 })] };
    render(<Browser spin={spin} {...baseProps} />);
    expect(screen.getByText(/pre-1985 box stats era-adjusted/i)).toBeTruthy();
  });

  it("renders 50 rows at a time and reveals more on demand", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 120 }, (_, i) => cand({ id: `p${i}`, name: `Player ${String(i).padStart(3, "0")}`, rank: i }));
    render(<Browser spin={{ team: "CHI", decade: "PRIME", candidates: many }} {...baseProps} mode={"prime" as const} />);
    expect(screen.getAllByRole("button", { name: /^Select / })).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: /Show 50 more/ }));
    expect(screen.getAllByRole("button", { name: /^Select / })).toHaveLength(100);
    await user.click(screen.getByRole("button", { name: /Show 20 more/ }));
    expect(screen.getAllByRole("button", { name: /^Select / })).toHaveLength(120);
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("puts a space between positions and the decade on a Prime row", () => {
    const spin = { team: "CHI", decade: "PRIME", candidates: [cand({ id: "a", name: "A", decade: "2000s", year: 2004, eligible: ["SF"] })] };
    render(<Browser spin={spin} {...baseProps} mode={"prime" as const} />);
    expect(screen.getByRole("button", { name: /^Select A/ }).textContent).toMatch(/SF · 00/);
  });
});

describe("Browser — no-slot guard", () => {
  it("does not enter the placing state for a player with no open eligible slot", async () => {
    const onSelect = vi.fn();
    const spin = { team: "CHI", decade: "2000s", candidates: [cand({ id: "a", name: "Adam Aaronson", rank: 0 })] };
    render(<Browser spin={spin} {...baseProps} canPlace={() => false} onSelect={onSelect} />);
    const row = screen.getByRole("button", { name: /^Select Adam/ });
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.getAttribute("aria-label")).toContain("no open slot");
    expect(row.className).toContain("cursor-not-allowed");
    await userEvent.setup().click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
