import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { isAuthEnabled, signNonce, NONCE_COOKIE, NONCE_TTL } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!isAuthEnabled()) return NextResponse.json({ error: "auth not configured" }, { status: 503 });
  const nonce = randomUUID();
  const c = await cookies();
  c.set(NONCE_COOKIE, await signNonce(nonce), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: NONCE_TTL,
  });
  return NextResponse.json({ nonce });
}
