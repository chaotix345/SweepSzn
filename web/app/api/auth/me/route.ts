import { NextResponse } from "next/server";
import { getSession } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ user: await getSession() });
}
