import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getSession } from "@/lib/authServer";
import { getMetrics } from "@/lib/metrics";

export const runtime = "nodejs";

// Admin-only JSON sibling of the /admin dashboard: the same getMetrics() funnel, curl-able/scriptable
// for launch-day reads. Gated by the session uid against ADMIN_UIDS (read at call time so tests and
// env changes take effect without a redeploy); 404 — not 401/403 — for anyone else, so the route's
// existence isn't even disclosed (mirrors /admin's notFound()).
export async function GET(req: Request) {
  const session = await getSession();
  const admins = (process.env.ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!session || !admins.includes(session.uid)) return new NextResponse(null, { status: 404 });

  const daysParam = new URL(req.url).searchParams.get("days");
  const n = Math.min(60, Math.max(2, Number(daysParam) || 14));
  const metrics = await getMetrics(redis, { days: n });
  return NextResponse.json(metrics, { headers: { "cache-control": "no-store" } });
}
