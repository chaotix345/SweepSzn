import { ImageResponse } from "next/og";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { decodeLineup } from "@/lib/share";
import { resultOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ lineup: string }> }) {
  const { lineup } = await params;
  const players = getPlayersByIds(decodeLineup(lineup));
  if (players.length !== 5) {
    return new ImageResponse(brandOgElement("Build an all-time NBA starting five."), { ...OG_SIZE });
  }
  const result = evaluateLineup(players, getCoefficients());
  return new ImageResponse(resultOgElement(result, players), { ...OG_SIZE });
}
