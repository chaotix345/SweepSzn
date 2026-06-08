import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isAuthEnabled, authedUid, signSession, verifyNonce, NONCE_COOKIE } from "@/lib/auth";
import { setSessionCookie } from "@/lib/authServer";

export const runtime = "nodejs";

// Module-level singleton so warm invocations reuse the JWKS cache.
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function POST(req: Request) {
  if (!isAuthEnabled()) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  // CSRF: a cross-site form POST can't set these. Reject anything that isn't our JSON fetch.
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== "application/json")
    return NextResponse.json({ error: "bad content-type" }, { status: 415 });
  if (req.headers.get("x-requested-with") !== "fetch")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { credential } = (await req.json().catch(() => ({}))) ?? {};
  if (typeof credential !== "string") return NextResponse.json({ error: "missing credential" }, { status: 400 });

  const c = await cookies();
  const nonceTok = c.get(NONCE_COOKIE)?.value;
  const expectedNonce = nonceTok ? await verifyNonce(nonceTok) : null;
  if (!expectedNonce) return NextResponse.json({ error: "missing nonce" }, { status: 400 });

  let payload;
  try {
    ({ payload } = await jwtVerify(credential, JWKS, {
      audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      issuer: ["accounts.google.com", "https://accounts.google.com"], // Google issues either form
    }));
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  if (payload.nonce !== expectedNonce) return NextResponse.json({ error: "nonce mismatch" }, { status: 401 });
  if (typeof payload.sub !== "string") return NextResponse.json({ error: "no subject" }, { status: 401 });

  const user = {
    uid: authedUid(payload.sub),
    name: typeof payload.name === "string" ? payload.name.slice(0, 24) : "Player",
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
  await setSessionCookie(await signSession(user));
  c.delete(NONCE_COOKIE);
  return NextResponse.json({ user });
}
