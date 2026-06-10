import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { isAuthEnabled, signNonce, NONCE_COOKIE, NONCE_TTL } from "@/lib/auth";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// POST + CSRF header guards (same as /api/auth/google): a cross-site form/navigation can't set
// these, so a third-party page can't silently mint nonce cookies for the visitor.
export async function POST(req: Request) {
  if (!isAuthEnabled()) return NextResponse.json({ error: "auth not configured" }, { status: 503 });
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== "application/json")
    return NextResponse.json({ error: "bad content-type" }, { status: 415 });
  if (req.headers.get("x-requested-with") !== "fetch")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // sign-ins are rare per-user; 10/min/IP stops nonce-cookie flooding without touching real flows
  if (!(await rateLimit(`rl:nonce:${ipOf(req)}`, 10, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const nonce = randomUUID();
  const c = await cookies();
  c.set(NONCE_COOKIE, await signNonce(nonce), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: NONCE_TTL,
  });
  return NextResponse.json({ nonce });
}
