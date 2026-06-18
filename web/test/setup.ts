// Global test setup. jsdom does not implement window.scrollTo (it logs "Not implemented: Window's
// scrollTo() method" to stderr). The draft placement flow now calls scrollToTop() (lib/scroll.ts),
// which several Game component tests exercise — stub scrollTo to a silent no-op so the test output
// stays clean. Guarded so node-environment tests (no window) are unaffected.
if (typeof window !== "undefined") {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
