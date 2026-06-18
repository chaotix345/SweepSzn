import { NextResponse } from "next/server";
import { coreRarity } from "@/lib/socialStore";
import { redis, rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// What fraction of completed games used this exact five-man core. Post-commit social proof on the
// result card. Rarity is orthogonal to quality — copy must never frame "rare" as "good" (DESIGN.md
// §12). Volume-gated in coreRarity: returns null below the sample threshold and the badge hides.
export async function GET(req: Request) {
  if (!(await rateLimit(`rl:rarity:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const u = new URL(req.url);
  const ids = (u.searchParams.get("ids") ?? "").split(",").filter((x) => /^[a-z0-9_]{1,64}$/.test(x));
  if (ids.length !== 5) return NextResponse.json({ error: "exactly 5 person ids required" }, { status: 400 });
  return NextResponse.json({ rarity: await coreRarity(redis, ids) });
}
