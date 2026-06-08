import { ImageResponse } from "next/og";
import { brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(brandOgElement("Build an all-time NBA starting five. Can you go 82-0?"), { ...OG_SIZE });
}
