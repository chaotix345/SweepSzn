import { ImageResponse } from "next/og";
import { resolveDuelCard } from "@/lib/duelBot";
import { personaInfo } from "@/lib/duel";
import { duelOgElement, brandOgElement, OG_SIZE, DUEL_OG_ALT, OG_CACHE } from "@/lib/og";

export const runtime = "nodejs";
export const alt = DUEL_OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ card: string }> }) {
  const { card } = await params;
  const d = resolveDuelCard(card);
  if (!d) return new ImageResponse(brandOgElement("Build an all-time NBA starting five."), { ...OG_SIZE, headers: OG_CACHE });
  return new ImageResponse(duelOgElement(personaInfo(d.persona).name, d.outcome, d.you, d.bot), { ...OG_SIZE, headers: OG_CACHE });
}
