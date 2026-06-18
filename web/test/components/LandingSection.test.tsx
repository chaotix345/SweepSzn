// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

// Isolate LandingSection's own copy/markup — the children (live engine card, live social strip) are
// tested separately. Capture ResultPreview's props so we can assert the hero card is NOT animated.
const resultPreviewProps: Record<string, unknown>[] = [];
vi.mock("@/components/ResultPreview", () => ({
  default: (props: Record<string, unknown>) => {
    resultPreviewProps.push(props);
    return React.createElement("div", { "data-testid": "result-preview" });
  },
}));
vi.mock("@/components/TodaysBest", () => ({
  default: () => React.createElement("div", { "data-testid": "todays-best" }),
}));

import LandingSection from "@/components/LandingSection";

afterEach(() => { cleanup(); resultPreviewProps.length = 0; });

describe("LandingSection — top-of-funnel hero", () => {
  it("leads the hero subhead with the engine differentiator (the explainable-engine moat)", () => {
    render(<LandingSection />);
    // 79-3 lives in TodaysBest right below; the subhead's prime real estate is the differentiator
    expect(document.body.textContent ?? "").toMatch(/finds every hole in your lineup/i);
  });

  it("keeps the 1,170-season credibility anchor in the hero", () => {
    render(<LandingSection />);
    expect(document.body.textContent ?? "").toContain("1,170");
  });

  it("uses one consistent action verb across both primary CTAs, each → /play", () => {
    render(<LandingSection />);
    const ctas = screen.getAllByRole("link", { name: /Draft your five/i });
    expect(ctas.length).toBeGreaterThanOrEqual(2); // hero + final, same verb (no Find out / Build mismatch)
    for (const cta of ctas) expect(cta.getAttribute("href")).toBe("/play");
  });

  it("does NOT play the buzzer reveal animation on the static hero example card (DESIGN.md: save the drama for the earned reveal)", () => {
    render(<LandingSection />);
    expect(resultPreviewProps.length).toBeGreaterThan(0);
    expect(resultPreviewProps[0].reveal).toBeFalsy();
  });
});
