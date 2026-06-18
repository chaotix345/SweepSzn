import { ImageResponse } from "next/og";
import { dexOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";
import { decodeDexShare } from "@/lib/share";
import { getPlayersByIds } from "@/lib/data";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

// Dynamic 1200×630 card for a shared Dex. Decodes the URL card, resolves the top player ids to names,
// and renders the collection card; falls back to the brand card if the segment doesn't resolve.
export default async function Image({ params }: { params: Promise<{ card: string }> }) {
  const { card } = await params;
  const d = decodeDexShare(card);
  if (!d) return new ImageResponse(brandOgElement("Drafted Dex"), { ...OG_SIZE });
  const players = getPlayersByIds(d.ids).map((p) => ({ name: p.name, team: p.team }));
  return new ImageResponse(dexOgElement(players, d.count, d.badges), { ...OG_SIZE });
}
