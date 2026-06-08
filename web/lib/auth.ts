import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "82-0_sess";
export const NONCE_COOKIE = "82-0_nonce";
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, seconds
export const NONCE_TTL = 60 * 5;              // 5 minutes, seconds

export interface SessionUser { uid: string; name: string; picture?: string }

// Both env vars must be present for auth to operate (mirrors isRedisEnabled()).
export function isAuthEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.AUTH_SECRET);
}

// Read the key lazily so tests can set AUTH_SECRET before first use.
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

// Stable, opaque, provider-namespaced. 32 chars of [a-z0-9] -> satisfies /^[a-z0-9-]{8,64}$/i.
export function authedUid(sub: string): string {
  return "g" + createHash("sha256").update("google:" + sub).digest("hex").slice(0, 31);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(key());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.sub !== "string") return null;
    return {
      uid: payload.sub,
      name: typeof payload.name === "string" ? payload.name : "",
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
    };
  } catch { return null; }
}

export async function signNonce(nonce: string): Promise<string> {
  return new SignJWT({ n: nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${NONCE_TTL}s`)
    .sign(key());
}

export async function verifyNonce(token: string): Promise<string | null> {
  try { const { payload } = await jwtVerify(token, key()); return typeof payload.n === "string" ? payload.n : null; }
  catch { return null; }
}
