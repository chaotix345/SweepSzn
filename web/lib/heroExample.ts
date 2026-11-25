import "server-only";
import { getPlayersByIds, getCoefficients } from "./data";
import { evaluateLineup } from "./engine";
import { SLOTS, displayName } from "./teams";

// The landing page's example five (slot order PG/SG/SF/PF/C): a balanced two-way GOAT lineup. Every
// number the home page quotes about it (record, grade, the usage-overload hit) is computed from the
// live engine here, so the copy can't drift from the ResultPreview card when coefficients change.
export const HERO_IDS = [
  "stephen_curry_gsw_2010s_2016",
  "michael_jordan_chi_1990s_1991",
  "lebron_james_mia_2010s_2013",
  "giannis_antetokounmpo_mil_2020s_2022",
  "nikola_joki_den_2020s_2024",
];

// The short names the marketing copy uses for the same five, in HERO_IDS order.
export const HERO_SHORT_NAMES = ["Curry", "Jordan", "LeBron", "Giannis", "Jokić"];

export function heroExample() {
  const players = getPlayersByIds(HERO_IDS);
  const result = evaluateLineup(players, getCoefficients());
  const usage = result.factors.find((f) => f.label.startsWith("Usage overload"));
  return {
    players,
    result,
    // the five as slot-labelled chips for the card (PG Stephen Curry, ...)
    chips: players.map((p, i) => ({ id: p.id, slot: SLOTS[i], name: displayName(p.name) })),
    usageOverload: usage ? usage.value : null,
  };
}
