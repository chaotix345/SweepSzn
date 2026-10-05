import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL, isAuthEnabled, verifySession, type SessionUser } from "./auth";

const secure = process.env.NODE_ENV === "production"; // env-gated so the cookie is sent on http://localhost

// Unconfigured auth (incl. a too-short AUTH_SECRET) means NO sessions — not "sessions signed with a weak key".
export async function getSession(): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;
  const c = await cookies();
  const tok = c.get(SESSION_COOKIE)?.value;
  return tok ? verifySession(tok) : null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_TTL });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}
