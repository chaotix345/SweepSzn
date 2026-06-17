// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
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
    expect(screen.queryByTitle(/discount|era-adjust|before 1985/i)).toBeTruthy();
  });
});
