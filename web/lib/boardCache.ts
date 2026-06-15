// CDN cache header for board GETs. Personalization rides the ?uid= query param, which is part of
// the CDN cache key — so per-user variants cache separately and nothing leaks across users (no
// board route reads cookies). 10s absorbs post-daily refresh spikes; SWR keeps reads instant
// while a fresh copy revalidates. Error responses never get this header (set on success only).
export const BOARD_CACHE = { "cache-control": "public, s-maxage=10, stale-while-revalidate=30" } as const;

// For auth-gated responses (weekly/all-time boards, profile): personalized and cookie-dependent, so
// the CDN must never cache or share them across users.
export const PRIVATE_NO_STORE = { "cache-control": "private, no-store" } as const;
