import { ImageResponse } from "next/og";
import { ascii, marketingOgElement, OG_SIZE } from "@/lib/og";
import { VS_INDEX_CARD, vsOgCard, vsStaticParams } from "@/lib/vsServer";

export const runtime = "nodejs";
export const alt = "Two famous NBA starting fives, head to head · SweepSzn";
export const size = OG_SIZE;
export const contentType = "image/png";

// Prerendered alongside the matchup pages (build-time data read; nothing at request time).
export const dynamicParams = false;
export function generateStaticParams() {
  return vsStaticParams();
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const card = vsOgCard((await params).slug) ?? VS_INDEX_CARD;
  // satori's default font is latin-only — strip diacritics from every text field
  return new ImageResponse(
    marketingOgElement({ ...card, title: ascii(card.title), sub: ascii(card.sub), chips: card.chips.map(ascii) }),
    { ...OG_SIZE },
  );
}
