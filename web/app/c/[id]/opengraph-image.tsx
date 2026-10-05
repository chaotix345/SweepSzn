import { ImageResponse } from "next/og";
import { getChallengePublic } from "@/lib/challengeStore";
import { challengeOgElement, brandOgElement, OG_SIZE, OG_ALT, OG_CACHE_LIVE } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const info = await getChallengePublic(id);
  // null is also a Redis blip — don't let the CDN pin the generic card over a live challenge
  if (!info) return new ImageResponse(brandOgElement("Beat a friend's all-time five."), { ...OG_SIZE, headers: { "cache-control": "no-store" } });
  return new ImageResponse(
    challengeOgElement(info.creatorName, { wins: info.wins, losses: info.losses, net: info.net, grade: info.grade }),
    { ...OG_SIZE, headers: OG_CACHE_LIVE },
  );
}
