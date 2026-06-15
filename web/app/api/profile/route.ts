import { NextResponse } from "next/server";
import { getSession } from "@/lib/authServer";
import { isRedisEnabled } from "@/lib/redis";
import { getProfileName, getStreakCount, getResults } from "@/lib/profileStore";
import { PRIVATE_NO_STORE } from "@/lib/boardCache";

export const runtime = "nodejs";

// The signed-in player's cross-device state: editable handle, server-authoritative streak, and the
// merged result history. Auth-gated — anonymous players read their own state from localStorage.
export async function GET() {
  if (!isRedisEnabled()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  const [name, streak, results] = await Promise.all([
    getProfileName(session.uid),
    getStreakCount(session.uid, Date.now()),
    getResults(session.uid),
  ]);
  return NextResponse.json(
    { name: name || session.name || "", picture: session.picture ?? "", streak, results },
    { headers: PRIVATE_NO_STORE },
  );
}
