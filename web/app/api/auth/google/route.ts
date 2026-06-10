import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isAuthEnabled, authedUid, signSession, verifyNonce, sha256hex, NONCE_COOKIE } from "@/lib/auth";
import { setSessionCookie } from "@/lib/authServer";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { bump } from "@/lib/evServer";

export const runtime = "nodejs";
const UID_RE = /^[a-z0-9-]{8,64}$/i;

// Module-level singleton so warm invocations reuse the JWKS cache.
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function POST(req: Request) {
  if (!isAuthEnabled()) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  // CSRF: a cross-site form POST can't set these. Reject anything that isn't our JSON fetch.
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== "application/json")
    return NextResponse.json({ error: "bad content-type" }, { status: 415 });
  if (req.headers.get("x-requested-with") !== "fetch")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // sign-ins are rare per-user; 10/min/IP bounds JWKS-verify work and session minting per IP
  if (!(await rateLimit(`rl:google:${ipOf(req)}`, 10, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) ?? {};
  const { credential, anonUid } = body;
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

  // OIDC echoes the nonce unmodified in the id_token; also accept a SHA-256 form as defense-in-depth.
  if (payload.nonce !== expectedNonce && payload.nonce !== sha256hex(expectedNonce))
    return NextResponse.json({ error: "nonce mismatch" }, { status: 401 });
  if (typeof payload.sub !== "string") return NextResponse.json({ error: "no subject" }, { status: 401 });

  const user = {
    uid: authedUid(payload.sub),
    name: typeof payload.name === "string" ? payload.name.slice(0, 24) : "Player",
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
    // bind the caller's own anon uid into the session so claim-cleanup can only ever remove THEIR row
    anon: typeof anonUid === "string" && UID_RE.test(anonUid) ? anonUid : undefined,
  };
  await setSessionCookie(await signSession(user));
  c.delete(NONCE_COOKIE);
  after(() => bump(redis, "signin", { uid: user.uid }));
  return NextResponse.json({ user: { uid: user.uid, name: user.name, picture: user.picture } });
}
