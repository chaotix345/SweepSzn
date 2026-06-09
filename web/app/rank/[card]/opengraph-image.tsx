import { ImageResponse } from "next/og";
import { decodeRankCard } from "@/lib/rankShare";
import { rankOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ card: string }> }) {
  const { card } = await params;
  const c = decodeRankCard(card);
  if (!c) return new ImageResponse(brandOgElement("Climb the SweepSzn leaderboard."), { ...OG_SIZE });
  return new ImageResponse(rankOgElement(c), { ...OG_SIZE });
}
