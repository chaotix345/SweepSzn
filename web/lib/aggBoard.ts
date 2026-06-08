import "server-only";
import { redis, readSortedRows } from "./redis";
import { keyWeekZ, keyWeekH, keyAlltimeZ, keyAlltimeH } from "./leaderboard";
import type { AggRow, AggLeaderboardRow, AggBoardView } from "./types";

// Read-only view of the weekly / all-time wins boards. Self-disabling via the shared redis module.
export async function getAggBoard(scope: "week" | "alltime", uid?: string, weekKey?: string): Promise<AggBoardView | null> {
  if (!redis) return null;
  const isWeek = scope === "week";
  if (isWeek && !weekKey) throw new Error("weekKey required for scope='week'");
  const key = isWeek ? (weekKey as string) : "alltime";
  const kz = isWeek ? keyWeekZ(key) : keyAlltimeZ();
  const kh = isWeek ? keyWeekH(key) : keyAlltimeH();
  const total = await redis.zcard(kz);
  const top = await readSortedRows<AggRow>(kz, kh, 0, 99);
  let you: AggLeaderboardRow | undefined = top.find((r) => r.uid === uid);
  if (uid && !you) {
    const rank = await redis.zrevrank(kz, uid);
    if (rank != null) {
      const meta = (await redis.hmget<Record<string, AggRow>>(kh, uid)) ?? {};
      const m = meta[uid];
      if (m) you = { ...m, rank: rank + 1 };
    }
  }
  return { scope, key, total, top, you };
}
