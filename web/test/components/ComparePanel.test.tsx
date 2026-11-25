// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React, { createRef } from "react";
import { ComparePanel } from "@/components/game/ComparePanel";
import type { DraftCandidate } from "@/lib/types";

const cand = (id: string, name: string): DraftCandidate => ({
  id, name, year: 1996, decade: "1990s", team: "CHI", pos: "SG", eligible: ["SG"], pts: 20, trb: 5, ast: 5, stl: 1, blk: 0.5,
} as DraftCandidate);

afterEach(() => cleanup());

describe("ComparePanel — Pick (F26)", () => {
  it("disables Pick with a reason when the player has no open slot, and picks the one who fits", () => {
    const onPick = vi.fn();
    const a = cand("a", "Alpha Able"), b = cand("b", "Bravo Baker");
    render(<ComparePanel a={a} b={b} dialogRef={createRef<HTMLDivElement>()} onClose={() => {}} onPick={onPick} canPick={(c) => c.id === "a"} />);
    const blocked = screen.getByRole("button", { name: /can't pick Bravo Baker — no open slot/i }) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(blocked.textContent).toMatch(/no open slot/);
    fireEvent.click(blocked);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pick Alpha Able" }));
    expect(onPick).toHaveBeenCalledWith(a);
  });
});

describe("ComparePanel — backdrop (N09)", () => {
  it("sits above the header and closes on a backdrop click, not a click inside the panel", () => {
    const onClose = vi.fn();
    render(<ComparePanel a={cand("a", "Alpha Able")} b={cand("b", "Bravo Baker")} dialogRef={createRef<HTMLDivElement>()} onClose={onClose} onPick={() => {}} canPick={() => true} />);
    const dialog = screen.getByRole("dialog", { name: "Compare players" });
    expect(dialog.className).toContain("z-50");
    fireEvent.click(screen.getByText("Alpha Able", { selector: "*" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
