import "server-only";
import { redis, readBoardView } from "./redis";
import { keyWeekZ, keyWeekH, keyAlltimeZ, keyAlltimeH } from "./leaderboard";
import type { AggRow, AggBoardView } from "./types";

// Read-only view of the weekly / all-time wins boards. Self-disabling via the shared redis module.
export async function getAggBoard(scope: "week" | "alltime", uid?: string, weekKey?: string): Promise<AggBoardView | null> {
  if (!redis) return null;
  const isWeek = scope === "week";
  if (isWeek && !weekKey) throw new Error("weekKey required for scope='week'");
  const key = isWeek ? (weekKey as string) : "alltime";
  const kz = isWeek ? keyWeekZ(key) : keyAlltimeZ();
  const kh = isWeek ? keyWeekH(key) : keyAlltimeH();
  const { total, top, you } = await readBoardView<AggRow>(kz, kh, uid);
  return { scope, key, total, top, you };
}
