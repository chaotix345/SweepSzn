import { ImageResponse } from "next/og";
import { marketingOgElement, OG_SIZE } from "@/lib/og";
import { VS_INDEX_CARD } from "@/lib/vsServer";

export const runtime = "nodejs";
export const alt = "Famous NBA team debates, settled by an engine · SweepSzn";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(marketingOgElement(VS_INDEX_CARD), { ...OG_SIZE });
}
