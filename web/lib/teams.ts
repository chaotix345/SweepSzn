import type { Slot } from "./types";

export const SLOTS: Slot[] = ["PG", "SG", "SF", "PF", "C"];
export const DECADES = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"] as const;
export type Decade = (typeof DECADES)[number];

// 82-0's authentic franchise palette: abbr -> [bg, text, accent?, accent2?]
const PALETTE: Record<string, string[]> = {
  ATL: ["#E03A3E", "#FFFFFF"], BOS: ["#007A33", "#FFFFFF", "#00A846"], BKN: ["#000000", "#FFFFFF", "#777777"],
  CHA: ["#00788C", "#FFFFFF", "#00788C", "#00ADCB"], CHI: ["#CE1141", "#FFFFFF"], CLE: ["#6F263D", "#FFB81C", "#6F263D", "#FFB81C"],
  DAL: ["#002B5E", "#C4CED4", "#0053BC"], DEN: ["#0E2240", "#FEC524", "#0E2240", "#FEC524"], DET: ["#C8102E", "#FFFFFF", "#C8102E", "#F11438"],
  GSW: ["#1D428A", "#FDB927", "#1D428A", "#FDB927"], HOU: ["#CE1141", "#FFFFFF"], IND: ["#041E42", "#FFC72C", "#041E42", "#FFC72C"],
  LAC: ["#1D428A", "#FFFFFF", "#4169C8"], LAL: ["#552583", "#FDB927", "#552583", "#FDB927"], MEM: ["#5D76A9", "#FFFFFF", "#5D76A9", "#88B0FF"],
  MIA: ["#000000", "#F9423A"], MIL: ["#00471B", "#EEE1C6", "#00813A", "#EEE1C6"], MIN: ["#0C2340", "#78BE20", "#78BE20"],
  NOP: ["#0C2340", "#B4975A", "#0C2340", "#B4975A"], NYK: ["#006BB6", "#F58426", "#006BB6", "#F58426"], OKC: ["#002D62", "#EF3B24", "#EF3B24"],
  ORL: ["#0077C0", "#C4CED4", "#0077C0", "#C4CED4"], PHI: ["#006BB6", "#FFFFFF", "#006BB6", "#FFFFFF"], PHX: ["#1D1160", "#E56020"],
  POR: ["#000000", "#E03A3E"], SAC: ["#5A2D81", "#FFFFFF", "#9B5DD5", "#AF68F1"], SAS: ["#000000", "#C4CED4", "#000000", "#FFFFFF"],
  TOR: ["#CE1141", "#FFFFFF"], UTA: ["#002B5C", "#F9A01B", "#002B5C", "#F9A01B"], WAS: ["#002B5C", "#FFFFFF", "#0053BC"],
};

const NAMES: Record<string, string> = {
  ATL: "Hawks", BOS: "Celtics", BKN: "Nets", CHA: "Hornets", CHI: "Bulls", CLE: "Cavaliers", DAL: "Mavericks",
  DEN: "Nuggets", DET: "Pistons", GSW: "Warriors", HOU: "Rockets", IND: "Pacers", LAC: "Clippers", LAL: "Lakers",
  MEM: "Grizzlies", MIA: "Heat", MIL: "Bucks", MIN: "Timberwolves", NOP: "Pelicans", NYK: "Knicks", OKC: "Thunder",
  ORL: "Magic", PHI: "76ers", PHX: "Suns", POR: "Trail Blazers", SAC: "Kings", SAS: "Spurs", TOR: "Raptors",
  UTA: "Jazz", WAS: "Wizards",
};

export const FRANCHISES = Object.keys(NAMES); // 30 current franchises (for reel cycling)

export interface TeamColor { bg: string; text: string; accent: string; }
export function teamColors(abbr: string): TeamColor {
  const t = PALETTE[abbr] || ["#F59E0B", "#000000"]; // amber fallback (matches 82-0)
  return { bg: t[0], text: t[1], accent: t[2] ?? t[0] };
}
export function teamName(abbr: string): string {
  return NAMES[abbr] || abbr;
}

// 82-0 shortens exactly four names on tokens; everyone else uses their full name.
const SHORT: Record<string, string> = {
  "Wilt Chamberlain": "Wilt", "Giannis Antetokounmpo": "Giannis",
  "Shai Gilgeous-Alexander": "SGA", "Kareem Abdul-Jabbar": "Kareem",
};
export function displayName(name: string): string {
  return SHORT[name] || name;
}

// "Vince Carter" -> "VC" (token initials)
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z .'-]/g, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// "2000s" -> "00's" (reel label, 82-0 style)
export function eraLabel(decade: string): string {
  const m = /^(\d{2})(\d0)s$/.exec(decade);
  return m ? `${m[2]}'s` : decade;
}

export function eligibleOf(p: { eligible?: Slot[]; pos: string }): Slot[] {
  if (p.eligible && p.eligible.length) return p.eligible;
  const s = p.pos as Slot;
  return SLOTS.includes(s) ? [s] : ["SF"]; // safety fallback
}
