import { ImageResponse } from "next/og";
import { getChallengePublic } from "@/lib/challengeStore";
import { challengeOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const info = await getChallengePublic(id);
  if (!info) return new ImageResponse(brandOgElement("Beat a friend's all-time five."), { ...OG_SIZE });
  return new ImageResponse(
    challengeOgElement(info.creatorName, { wins: info.wins, losses: info.losses, net: info.net, grade: info.grade }),
    { ...OG_SIZE },
  );
}
