import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "82-0_sess";
export const NONCE_COOKIE = "82-0_nonce";
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, seconds
export const NONCE_TTL = 60 * 5;              // 5 minutes, seconds

export interface SessionUser { uid: string; name: string; picture?: string; anon?: string }

// Both env vars must be present, and the secret long enough, for auth to operate
// (mirrors isRedisEnabled()). A too-short secret is treated as unconfigured.
export function isAuthEnabled(): boolean {
  const secret = process.env.AUTH_SECRET;
  return !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && secret && secret.length >= 32);
}

// Read the key lazily so tests can set AUTH_SECRET before first use.
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

// Stable, opaque, provider-namespaced. 32 chars of [a-z0-9] -> satisfies /^[a-z0-9-]{8,64}$/i.
export function authedUid(sub: string): string {
  return "g" + sha256hex("google:" + sub).slice(0, 31);
}

// The one gate for a client-asserted ANONYMOUS uid (every no-session fallback + the sign-in anon
// binding). authedUid's "g" + 31 hex also passes the shape regex, so without the namespace check a
// cookie-less request could act AS a signed-in player. Real anon uids (lib/streak.ts: randomUUID,
// id-…, anon-…) never take that shape. Case-insensitive: some stores lowercase the uid into a key.
export function isAnonUid(u: unknown): u is string {
  return typeof u === "string" && /^[a-z0-9-]{8,64}$/i.test(u) && !/^g[0-9a-f]{31}$/i.test(u);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, picture: user.picture, anon: user.anon })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(key());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      uid: payload.sub,
      name: typeof payload.name === "string" ? payload.name : "",
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      // re-gated here too: cookies minted before the sign-in-time isAnonUid check could carry a g-uid
      anon: isAnonUid(payload.anon) ? payload.anon : undefined,
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
  try { const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] }); return typeof payload.n === "string" ? payload.n : null; }
  catch { return null; }
}
