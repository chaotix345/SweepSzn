// Client-only inbound referral capture — mirrors lib/utm.ts. A referral code rides an inbound URL as
// ?ref=<code>; we first-touch persist it so a /?ref= landing → a clean /play navigation still
// attributes the eventual first_play to the referrer. §12-safe: the code is an opaque public proxy
// (never the bearer uid), sanitized before it ever reaches storage or the wire.
const IN_KEY = "szn:ref:in";    // the inbound code that brought THIS visitor (first-touch)
const OWN_KEY = "szn:ref:code"; // this user's OWN code, cached after /api/referral mints it
// Mirrors REF_RE in lib/referralCode.ts (server).
const REF_RE = /^r[0-9a-f]{11}$/;

function sanitize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return REF_RE.test(raw) ? raw : null;
}

// The referral code in the CURRENT page URL (same-page read).
export function currentRefCode(): string | null {
  try {
    return sanitize(new URLSearchParams(window.location.search).get("ref"));
  } catch {
    return null;
  }
}

// The first-touch inbound code persisted on this device.
export function getRefCode(): string | null {
  try {
    return sanitize(localStorage.getItem(IN_KEY));
  } catch {
    return null;
  }
}

// Persist the current URL's referral code if present and nothing is stored yet (first channel wins).
export function captureRef(): void {
  try {
    const code = currentRefCode();
    if (code && !localStorage.getItem(IN_KEY)) localStorage.setItem(IN_KEY, code);
  } catch {
    /* storage blocked (private mode) — referral attribution is best-effort */
  }
}

// This user's own sharable code (cached after the invite UI mints it via /api/referral).
export function getOwnRefCode(): string | null {
  try {
    return sanitize(localStorage.getItem(OWN_KEY));
  } catch {
    return null;
  }
}

export function setOwnRefCode(code: string): void {
  try {
    if (sanitize(code)) localStorage.setItem(OWN_KEY, code);
  } catch {
    /* storage blocked — the invite UI will just re-mint next time */
  }
}
