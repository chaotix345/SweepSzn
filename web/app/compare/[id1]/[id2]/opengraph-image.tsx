import { ImageResponse } from "next/og";
import { resolveSharedLineup } from "@/lib/sharedLineup";
import { compareOgElement, brandOgElement, OG_SIZE, OG_ALT, OG_CACHE } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id1: string; id2: string }> }) {
  const { id1, id2 } = await params;
  // same resolver as the /compare page (and /r), so a bad segment falls back to the brand card
  const a = resolveSharedLineup(id1);
  const b = resolveSharedLineup(id2);
  if (!a || !b) return new ImageResponse(brandOgElement("Put two all-time fives head to head."), { ...OG_SIZE, headers: OG_CACHE });
  return new ImageResponse(compareOgElement(a, b), { ...OG_SIZE, headers: OG_CACHE });
}
