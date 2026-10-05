import { ImageResponse } from "next/og";
import { resolveSharedLineup } from "@/lib/sharedLineup";
import { resultOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ lineup: string }> }) {
  const { lineup } = await params;
  // same resolver as the /r page (count, dupes, one person per five, prime/bp exclusivity)
  const data = resolveSharedLineup(lineup);
  if (!data) return new ImageResponse(brandOgElement("Build an all-time NBA starting five."), { ...OG_SIZE });
  const { result, players, hinted, prime, blueprint } = data;
  return new ImageResponse(resultOgElement(result, players, hinted, undefined, prime, blueprint ?? undefined), { ...OG_SIZE });
}
