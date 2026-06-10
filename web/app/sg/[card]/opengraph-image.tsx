import { ImageResponse } from "next/og";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { decodeSurgeonCard, surgeonDiagnosis } from "@/lib/surgeon";
import { surgeonOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ card: string }> }) {
  const { card } = await params;
  const dec = decodeSurgeonCard(card);
  const beforePlayers = dec ? getPlayersByIds(dec.beforeIds) : [];
  const afterPlayers = dec ? getPlayersByIds(dec.afterIds) : [];
  if (!dec || beforePlayers.length !== 5 || afterPlayers.length !== 5
    || new Set(beforePlayers.map((p) => p.person_id ?? p.id)).size !== 5
    || new Set(afterPlayers.map((p) => p.person_id ?? p.id)).size !== 5) {
    return new ImageResponse(brandOgElement("Build an all-time NBA starting five."), { ...OG_SIZE });
  }
  const c = getCoefficients();
  const before = evaluateLineup(beforePlayers, c);
  const after = evaluateLineup(afterPlayers, c);
  const diagnosis = surgeonDiagnosis(before.factors);
  if (!diagnosis) return new ImageResponse(brandOgElement("Build an all-time NBA starting five."), { ...OG_SIZE });
  return new ImageResponse(
    surgeonOgElement(before, after, diagnosis, beforePlayers[dec.outIdx], afterPlayers[dec.outIdx]),
    { ...OG_SIZE },
  );
}
