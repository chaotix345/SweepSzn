import { ImageResponse } from "next/og";
import { ascii, marketingOgElement, OG_SIZE } from "@/lib/og";
import { franchiseFromSlug, franchiseOgCard, franchiseStaticParams, TEAMS_INDEX_CARD } from "@/lib/franchise";

export const runtime = "nodejs";
export const alt = "An NBA franchise's all-time starting five · SweepSzn";
export const size = OG_SIZE;
export const contentType = "image/png";

// Prerendered alongside the 30 franchise pages (build-time data read; nothing at request time).
export const dynamicParams = false;
export function generateStaticParams() {
  return franchiseStaticParams();
}

export default async function Image({ params }: { params: Promise<{ team: string }> }) {
  const team = franchiseFromSlug((await params).team);
  const card = (team && franchiseOgCard(team)) || TEAMS_INDEX_CARD;
  // satori's default font is latin-only — strip diacritics (Dončić, Jokić) from every text field
  return new ImageResponse(
    marketingOgElement({ ...card, title: ascii(card.title), sub: ascii(card.sub), chips: card.chips.map(ascii) }),
    { ...OG_SIZE },
  );
}
