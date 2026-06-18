import { describe, it, expect, vi } from "vitest";
import { scrollToTop } from "@/lib/scroll";

// After a draft pick is placed, the candidate browser collapses (the next pick needs a fresh spin),
// the page shrinks, and the scroll position is left clamped below the reels — so the player loses
// sight of the reels + turn count (reported mobile bug, 2026-06-18). scrollToTop() brings the viewport
// back up; it must respect prefers-reduced-motion and never throw when matchMedia is unavailable.
describe("scrollToTop", () => {
  it("scrolls the window to the top with smooth behavior by default", () => {
    const scrollTo = vi.fn();
    const win = { scrollTo, matchMedia: () => ({ matches: false }) };
    scrollToTop(win as unknown as Window);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("uses instant ('auto') behavior under prefers-reduced-motion", () => {
    const scrollTo = vi.fn();
    const win = { scrollTo, matchMedia: () => ({ matches: true }) };
    scrollToTop(win as unknown as Window);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("does not throw when matchMedia is unavailable (older webviews) and defaults to smooth", () => {
    const scrollTo = vi.fn();
    const win = { scrollTo };
    expect(() => scrollToTop(win as unknown as Window)).not.toThrow();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("does not throw when scrollTo is unavailable", () => {
    const win = { matchMedia: () => ({ matches: false }) };
    expect(() => scrollToTop(win as unknown as Window)).not.toThrow();
  });
});
