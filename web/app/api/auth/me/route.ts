import { NextResponse } from "next/server";
import { getSession } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  // don't expose the internal anon binding to the client
  return NextResponse.json({ user: s ? { uid: s.uid, name: s.name, picture: s.picture } : null });
}
