// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

import ShareHeader from "@/components/ShareHeader";

afterEach(cleanup);

describe("ShareHeader — the shared permalink header (prevents the /pe/ + /sg/ CTA drift)", () => {
  it("renders the wordmark, the tagline, and a play CTA that deep-links a cold arrival into Daily", () => {
    render(<ShareHeader tagline="a friend shared their five" cta="Can you beat this? →" />);
    expect(screen.getByText("a friend shared their five")).toBeTruthy();
    const cta = screen.getByRole("link", { name: /Can you beat this\?/i });
    // deep-link past the mode-select wall: a cold X arrival drops straight into a guided first spin
    expect(cta.getAttribute("href")).toBe("/play?mode=daily");
  });

  it("renders the CTA at the md (44px) size and in the action orange (DESIGN.md: only CTA color)", () => {
    render(<ShareHeader tagline="x" cta="Beat the crowd →" />);
    const cta = screen.getByRole("link", { name: /Beat the crowd/i });
    expect(cta.className).toContain("min-h-11"); // SIZES.md → ≥44px tap target
    expect(cta.className).toContain("bg-orange-500"); // primary orange
    // never a mode accent on a CTA
    expect(cta.className).not.toMatch(/bg-(violet|cyan|rose)-/);
  });

  it("links the wordmark home", () => {
    render(<ShareHeader tagline="x" cta="y" />);
    const home = screen.getAllByRole("link").find((l) => l.textContent?.includes("Sweep"));
    expect(home?.getAttribute("href")).toBe("/");
  });

  it("supports a custom CTA href for non-/play targets", () => {
    render(<ShareHeader tagline="x" cta="y" ctaHref="/dex" />);
    expect(screen.getByRole("link", { name: "y" }).getAttribute("href")).toBe("/dex");
  });
});
