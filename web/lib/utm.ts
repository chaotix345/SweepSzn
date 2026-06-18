// Client-only acquisition attribution. Captures `?utm_source=` at the FIRST landing (any route) and
// persists it first-touch, so when `first_play` later fires on /play — after the CTA has navigated to
// a clean URL — we can still attribute the play to the channel that brought the visitor. §12-safe: a
// public channel label, never an engine hint; the value is sanitized before it ever reaches Redis.
const KEY = "szn:utm:source";
// Lowercase-only, ≤40 chars. Bans anything that could be abused as a Redis hash-field name and folds
// "X_Launch"/"x_launch" into one bucket. Mirrored by the server-side SRC_RE in evServer.ts.
const SRC_RE = /^[a-z0-9_.-]{1,40}$/;

function sanitize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  return SRC_RE.test(s) ? s : null;
}

// The source in the CURRENT page URL (same-page read — used by the visit beacon on landing/permalinks).
export function currentUtmSource(): string | null {
  try {
    return sanitize(new URLSearchParams(window.location.search).get("utm_source"));
  } catch {
    return null;
  }
}

// The first-touch source persisted on this device (used by first_play, fired post-navigation).
export function getUtmSource(): string | null {
  try {
    return sanitize(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

// Persist the current URL's source if present and nothing is stored yet (first channel wins).
export function captureUtm(): void {
  try {
    const src = currentUtmSource();
    if (src && !localStorage.getItem(KEY)) localStorage.setItem(KEY, src);
  } catch {
    /* storage blocked (private mode) — attribution is best-effort */
  }
}
