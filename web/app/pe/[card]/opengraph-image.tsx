import { ImageResponse } from "next/og";
import { resolveSharedPickem } from "@/lib/sharedLineup";
import { resultOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ card: string }> }) {
  const { card } = await params;
  const data = resolveSharedPickem(card);
  if (!data) return new ImageResponse(brandOgElement("Build an all-time NBA starting five."), { ...OG_SIZE });
  const { result, players, hinted, view, prime, blueprint } = data;
  return new ImageResponse(resultOgElement(result, players, hinted, view, prime, blueprint ?? undefined), { ...OG_SIZE });
}
