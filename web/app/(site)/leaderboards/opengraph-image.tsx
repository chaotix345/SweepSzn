import { ImageResponse } from "next/og";
import { marketingOgElement, OG_SIZE } from "@/lib/og";
import { MARKETING_META } from "@/lib/marketingMeta";

export const runtime = "nodejs";
export const alt = MARKETING_META.leaderboards.ogTitle;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(marketingOgElement(MARKETING_META.leaderboards.card), { ...OG_SIZE });
}
