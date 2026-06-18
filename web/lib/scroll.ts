// Bring the viewport back to the top of the page. Used after a draft pick is placed: the candidate
// browser collapses (the next pick needs a fresh spin) so the page shrinks and the scroll position is
// left clamped below the reels, leaving the player without the reels + turn count in view (reported
// mobile bug, 2026-06-18). Thin wrapper so it can be unit-tested with a mock window. Respects
// prefers-reduced-motion; tolerant of older webviews missing matchMedia/scrollTo.
type ScrollableWindow = Pick<Window, "scrollTo"> & Partial<Pick<Window, "matchMedia">>;

export function scrollToTop(win: ScrollableWindow = window): void {
  const reduce = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  win.scrollTo?.({ top: 0, behavior: reduce ? "auto" : "smooth" });
}
