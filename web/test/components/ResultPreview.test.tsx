// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import ResultPreview from "@/components/ResultPreview";

afterEach(cleanup);

describe("ResultPreview — landing hero example card", () => {
  it("labels the card as live engine output (answers the skeptic's 'is this real?')", () => {
    const { container } = render(<ResultPreview />);
    expect(container.textContent).toMatch(/Live engine output/i);
    expect(container.textContent).toMatch(/the same model that grades your draft/i);
  });

  it("does NOT animate by default — the buzzer reveal is reserved for the earned in-game result (DESIGN.md)", () => {
    const { container } = render(<ResultPreview />);
    expect(container.innerHTML).not.toContain("animate-gold-pulse");
    expect(container.innerHTML).not.toContain("animate-record-slam");
  });

  it("still animates when reveal is explicitly set (the in-game reveal path keeps the prop)", () => {
    const { container } = render(<ResultPreview reveal />);
    expect(container.innerHTML).toContain("animate-gold-pulse");
    expect(container.innerHTML).toContain("animate-record-slam");
  });

  it("renders a real engine-computed record (the proof is the live output, not a mock)", () => {
    const { container } = render(<ResultPreview />);
    expect(container.textContent).toMatch(/projected record/i);
  });
});
