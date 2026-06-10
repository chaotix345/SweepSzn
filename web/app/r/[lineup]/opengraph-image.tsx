import { ImageResponse } from "next/og";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { decodeShare } from "@/lib/share";
import { bpFromCode, gradeBlueprint } from "@/lib/blueprint";
import { resultOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ lineup: string }> }) {
  const { lineup } = await params;
  const { ids, hinted, prime, bp } = decodeShare(lineup);
  const players = getPlayersByIds(ids);
  if (ids.length !== 5 || new Set(ids).size !== 5 || players.length !== 5) {
    return new ImageResponse(brandOgElement("Build an all-time NBA starting five."), { ...OG_SIZE });
  }
  const result = evaluateLineup(players, getCoefficients());
  // blueprint and prime are mutually exclusive modes — a crafted bs~p~ URL renders as blueprint only
  const bpKey = bpFromCode(bp);
  const blueprint = bpKey ? gradeBlueprint(bpKey, result) : undefined;
  return new ImageResponse(resultOgElement(result, players, hinted, undefined, bpKey ? false : prime, blueprint), { ...OG_SIZE });
}
