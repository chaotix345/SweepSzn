// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { UsageBar, SkipBtn } from "@/components/game/controls";

afterEach(() => cleanup());

describe("SkipBtn — re-spin resource disclosure (R3)", () => {
  it("discloses that the re-spin is per-game and does not carry over", () => {
    render(<SkipBtn label="↻ Re-spin Team" used={false} onClick={() => {}} />);
    const btn = screen.getByRole("button");
    const title = btn.getAttribute("title") ?? "";
    expect(title.toLowerCase()).toContain("per game");
    expect(title.toLowerCase()).toMatch(/carry over|doesn'?t carry|expire/);
  });
});

describe("UsageBar — penalise-not-block disclosure (R3)", () => {
  it("when under budget, states the cap penalises rather than blocks", () => {
    render(<UsageBar total={70} />);
    const note = screen.queryByText(/penalis|docks points|not a (hard )?cap|won'?t block/i);
    expect(note).toBeTruthy();
  });

  it("when over budget, still shows the existing over-budget cost line", () => {
    render(<UsageBar total={130} />);
    expect(screen.getByText(/over the limit/i)).toBeTruthy();
  });
});
