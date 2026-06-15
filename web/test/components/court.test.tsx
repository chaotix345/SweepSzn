// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { Court } from "@/components/game/court";
import type { DraftCandidate, Slot } from "@/lib/types";

afterEach(() => cleanup());

const player = (name: string): DraftCandidate => ({
  id: name, name, team: "CHI", pos: "PG", eligible: ["PG", "SG", "SF", "PF", "C"],
  year: 1996, decade: "1990s", pts: 20, trb: 5, ast: 5, stl: 1, blk: 0.5,
} as DraftCandidate);

const filledRoster = () => ({ PG: player("Magic Johnson"), SG: null, SF: null, PF: null, C: null } as Record<Slot, DraftCandidate | null>);

describe("Court — move/swap discoverability (R7)", () => {
  it("a filled slot signals it can be moved when idle (no active selection)", () => {
    render(<Court roster={filledRoster()} selSlot={null} isTarget={() => false} onSlot={() => {}} idle />);
    const slot = screen.getByRole("button", { name: /Magic Johnson at PG/i });
    expect(slot.getAttribute("title")).toMatch(/move/i);
    expect(slot.getAttribute("aria-label")).toMatch(/tap to move/i);
  });

  it("does not show the move affordance while a selection is in progress", () => {
    render(<Court roster={filledRoster()} selSlot={"SG" as Slot} isTarget={() => false} onSlot={() => {}} idle={false} />);
    const slot = screen.getByRole("button", { name: /Magic Johnson at PG/i });
    expect(slot.getAttribute("title")).toBeNull();
    expect(slot.getAttribute("aria-label")).not.toMatch(/tap to move/i);
  });
});
