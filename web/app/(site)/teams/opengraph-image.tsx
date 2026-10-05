import { ImageResponse } from "next/og";
import { marketingOgElement, OG_SIZE } from "@/lib/og";
import { TEAMS_INDEX_CARD } from "@/lib/franchise";

export const runtime = "nodejs";
export const alt = "All-time starting fives for every NBA franchise · SweepSzn";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(marketingOgElement(TEAMS_INDEX_CARD), { ...OG_SIZE });
}
