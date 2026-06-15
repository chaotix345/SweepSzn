"use client";
// Backed by the app-wide SessionProvider context (one shared /api/auth/me fetch) instead of a
// per-component fetch. Same return shape as before, plus promptSignIn(), so existing callers are
// unchanged. Components rendered without the provider get the safe signed-out default.
export type { SessionUser } from "@/components/SessionProvider";
export { useSessionContext as useSession } from "@/components/SessionProvider";
