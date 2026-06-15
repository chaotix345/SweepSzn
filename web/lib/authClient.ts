// Client-safe flag: whether Google sign-in is configured. NEXT_PUBLIC_* is inlined at build, so this
// is the single source of truth for "show sign-in UI" across the client components (mirrors the
// server-side isAuthEnabled() in lib/auth.ts, which additionally requires AUTH_SECRET).
export const AUTH_ENABLED = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
