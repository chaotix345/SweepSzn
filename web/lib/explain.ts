import type { LineupResult, PlayerBreakdown, Player } from "./types";

// Pure presentation helpers for the result card. NO engine math here — these only turn the
// engine's already-computed numbers into plain English (the thing 82-0 never does).

export interface FactorView {
  label: string;
  value: number;
  kind: "good" | "bad";
  blurb: string;
}

// Map an engine factor to a one-line explanation of WHY it moves the rating.
export function factorBlurb(label: string, value = 0): string {
  const l = label.toLowerCase();
  if (l.startsWith("star offense")) return "Combined scoring + creation above an average lineup (volume × efficiency, era-adjusted).";
  if (l.startsWith("star defense")) return "Combined defensive impact — steals, blocks, defensive rebounding and rim protection.";
  if (l.startsWith("usage overload")) return "Too many ball-dominant stars: one ball and ~100 possessions can't feed them all, so efficiency drops.";
  if (l.startsWith("spacing")) return value >= 0
    ? "Enough outside shooting to bend the defense and open driving lanes."
    : "Cramped floor — not enough shooting, so the paint stays clogged.";
  if (l.startsWith("no interior size")) return "No real big — the lineup concedes the rim, the post, and the defensive glass to anyone with size.";
  if (l.startsWith("thin interior size")) return "Undersized inside — limited rim protection and rebounding against bigger frontlines.";
  if (l.startsWith("no rim protection")) return "No real shot-blocker inside — opponents convert at the rim and you allow more points.";
  if (l.startsWith("no perimeter defender")) return "No on-ball stopper on the wing — opposing guards get downhill too easily.";
  return "Contribution to the team rating.";
}

// strip the engine's parenthetical detail ("(146% demand)") for headline/summary copy
const plain = (label: string) => label.replace(/\s*\(.*\)\s*$/, "").toLowerCase();

export function factorViews(result: LineupResult): FactorView[] {
  return result.factors.map((f) => ({ ...f, blurb: factorBlurb(f.label, f.value) }));
}

export interface RoleView { role: string; blurb: string; }

// Classify a drafted player's role from the engine's per-player breakdown + their box line.
export function playerRole(p: Player | undefined, b: PlayerBreakdown): RoleView {
  const ast = p?.ast ?? 0;
  const off = b.off, def = b.def, usage = b.usage;
  const big = b.rimProtector || p?.pos === "C" || p?.pos === "PF";

  if (b.rimProtector && def >= 2) return { role: "Rim protector", blurb: "Anchors the defense at the rim." };
  if (off >= 3 && usage >= 29 && ast >= 5) return { role: "Lead creator", blurb: "Runs the offense — high usage and high assists." };
  if (off >= 3 && usage >= 29) return { role: "Primary scorer", blurb: "First option — carries the scoring load." };
  if (ast >= 6) return { role: "Playmaker", blurb: "Sets the table for everyone else." };
  if (b.shooter && def >= 0.5) return { role: "3&D wing", blurb: "Spaces the floor and defends on the wing." };
  if (b.shooter) return { role: "Floor spacer", blurb: "Stretches the defense with outside shooting." };
  if (def >= 1.5) return { role: big ? "Defensive big" : "Perimeter stopper", blurb: "Carries real defensive value." };
  if (off >= 2) return { role: "Secondary scorer", blurb: "Reliable second-side scoring punch." };
  return { role: "Role player", blurb: "Fills a complementary role." };
}

// If players land the same role, weaker ones are demoted down a chain so every card reads
// distinctly (chains are deep enough to disambiguate up to ~4 same-archetype players).
const DEMOTE: Record<string, RoleView> = {
  "Lead creator": { role: "Secondary creator", blurb: "A second initiator off the bounce." },
  "Secondary creator": { role: "Combo guard", blurb: "Scores and creates in a smaller role." },
  "Primary scorer": { role: "Secondary scorer", blurb: "Reliable second-side scoring punch." },
  "Secondary scorer": { role: "Bench scorer", blurb: "Instant offense in a complementary role." },
  "Playmaker": { role: "Secondary playmaker", blurb: "Keeps the ball moving as a connector." },
  "Secondary playmaker": { role: "Connector", blurb: "Glue passing and ball movement." },
  "Floor spacer": { role: "Movement shooter", blurb: "Knocks down shots off the catch." },
  "Movement shooter": { role: "Spot-up shooter", blurb: "Punishes help defense from outside." },
  "3&D wing": { role: "Wing defender", blurb: "Guards on the perimeter, hits open looks." },
  "Wing defender": { role: "Two-way wing", blurb: "Defends and contributes on offense." },
  "Rim protector": { role: "Interior defender", blurb: "Adds size and help defense inside." },
  "Defensive big": { role: "Interior defender", blurb: "Adds size and help defense inside." },
  "Interior defender": { role: "Help defender", blurb: "Protects the paint as a secondary big." },
  "Perimeter stopper": { role: "On-ball defender", blurb: "Picks up tough perimeter assignments." },
  "Role player": { role: "Rotation piece", blurb: "Dependable minutes in a defined role." },
  "Rotation piece": { role: "Glue guy", blurb: "Does the little things that help win." },
};

// how strongly a player "owns" their role (so the strongest keeps the pure label)
const strength = (r: string, p: Player | undefined, b: PlayerBreakdown) => {
  if (r.includes("creator") || r.includes("scorer")) return b.off + b.usage / 10;
  if (r.includes("playmaker") || r === "Playmaker") return p?.ast ?? 0;
  if (r.includes("protector") || r.includes("Defensive") || r.includes("defender")) return b.def;
  return b.off;
};

// Assign roles across the whole lineup, de-duplicating identical labels.
export function lineupRoles(players: Player[], breakdowns: PlayerBreakdown[]): RoleView[] {
  const base = players.map((p, i) => ({ i, view: playerRole(p, breakdowns[i]), p, b: breakdowns[i] }));
  const out: RoleView[] = new Array(players.length);
  const used = new Set<string>();
  // strongest owner of each role keeps the pure label; later dupes get demoted
  for (const item of [...base].sort((a, c) => strength(c.view.role, c.p, c.b) - strength(a.view.role, a.p, a.b))) {
    let view = item.view;
    while (used.has(view.role) && DEMOTE[view.role]) view = DEMOTE[view.role];
    used.add(view.role);
    out[item.i] = view;
  }
  return out;
}

// A one-sentence headline summarizing the verdict.
export function headline(result: LineupResult): string {
  const net = result.netRtg;
  const helps = result.factors.filter((f) => f.value > 0).sort((a, b) => b.value - a.value);
  const hurts = result.factors.filter((f) => f.value < 0).sort((a, b) => a.value - b.value);
  const lead = net >= 10 ? "An elite, well-balanced lineup"
    : net >= 4 ? "A strong contender"
    : net >= -2 ? "A roughly average lineup"
    : "A flawed lineup";
  const topHurt = hurts[0];
  if (topHurt && net < 12) return `${lead} — its biggest drag is ${plain(topHurt.label)}.`;
  const topHelp = helps[0];
  return topHelp ? `${lead}, carried by ${plain(topHelp.label)}.` : `${lead}.`;
}
