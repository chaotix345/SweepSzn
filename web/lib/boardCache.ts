// CDN cache header for board GETs. A board GET is the public, un-personalized read: it ignores any
// uid in the query (the bearer anon uid never rides a URL — DESIGN.md §12) and reads no cookies, so
// one cached copy is safe to share. Personalized reads ("you" + `me`) are POSTs with PRIVATE_NO_STORE.
// 10s absorbs post-daily refresh spikes; SWR keeps reads instant while a fresh copy revalidates.
// Error responses never get this header (set on success only).
export const BOARD_CACHE = { "cache-control": "public, s-maxage=10, stale-while-revalidate=30" } as const;

// For personalized responses (session-gated weekly/all-time boards, profile, uid-in-body board reads):
// the CDN must never cache or share them across users.
export const PRIVATE_NO_STORE = { "cache-control": "private, no-store" } as const;
