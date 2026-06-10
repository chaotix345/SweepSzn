import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/authServer";

export const runtime = "nodejs";

// CSRF header guard (same as nonce/google): sameSite=lax already blocks most cross-site POSTs,
// but it is a browser-enforcement-only control — this closes the gap so a third-party page can't
// silently sign the visitor out.
export async function POST(req: Request) {
  if (req.headers.get("x-requested-with") !== "fetch")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
