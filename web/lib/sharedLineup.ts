import "server-only";
import { getPlayersByIds, getCoefficients } from "./data";
import { evaluateLineup } from "./engine";
import { decodeShare } from "./share";
import { bpFromCode, gradeBlueprint, type BlueprintView } from "./blueprint";
import type { LineupResult, Player } from "./types";

// Decode a /r/ share segment and re-run the engine to reconstruct the exact shared result. The encoded
// segment IS the id — nothing is stored — so this is the single resolver behind the /r/ page, the
// GET /api/result/[lineup] JSON endpoint (friend compare), and the /compare/[a]/[b] page.

export interface SharedLineup {
  players: Player[];
  result: LineupResult;
  hinted: boolean;
  prime: boolean;
  blueprint: BlueprintView | null;
}

export function resolveSharedLineup(segment: string): SharedLineup | null {
  const { ids, hinted, prime, bp } = decodeShare(segment);
  // reject crafted URLs with the wrong count or duplicate ids (5 of the same player would otherwise
  // pass the length check and render a nonsensical fabricated record) — mirrors verifyTrace's guard
  if (ids.length !== 5 || new Set(ids).size !== 5) return null;
  const players = getPlayersByIds(ids);
  if (players.length !== 5) return null;
  const result = evaluateLineup(players, getCoefficients());
  // a b<code>~ prefix re-derives the blueprint execution grade from the same result (deterministic).
  // blueprint and prime are mutually exclusive modes — a crafted bs~p~ URL renders as blueprint only.
  const bpKey = bpFromCode(bp);
  return { players, result, hinted, prime: bpKey ? false : prime, blueprint: bpKey ? gradeBlueprint(bpKey, result) : null };
}
