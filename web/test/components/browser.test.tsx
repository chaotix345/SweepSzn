// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

describe("Browser — neutral default sort (R8)", () => {
  it("does not default to PPG order (no high-scorer-first steering)", () => {
    // Adam scores least, Zane scores most. PPG default would put Zane first.
    const spin = { team: "CHI", decade: "2000s", candidates: [
      cand({ id: "a", name: "Adam Aaronson", pts: 10 }),
      cand({ id: "z", name: "Zane Zykov", pts: 30 }),
    ] };
    render(<Browser spin={spin} {...baseProps} />);
    const rows = screen.getAllByRole("button", { name: /^Select / });
    expect(rows[0].getAttribute("aria-label")).toContain("Adam Aaronson");
    expect(rows[1].getAttribute("aria-label")).toContain("Zane Zykov");
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
