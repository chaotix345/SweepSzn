import "server-only";
import { HERO_IDS } from "@/components/ResultPreview";
import { getCoefficients, getPlayersByIds } from "./data";
import { evaluateLineup } from "./engine";
import { getEngineMeta } from "./receipts";
import { VS_MATCHUPS } from "./vs";
import { vsView } from "./vsServer";

// Direct, quotable answers to the questions people ask search engines and AI assistants. Built at
// build time (the pages that use them are static) from the live engine and coefficients.json, so the
// numbers can't drift from what the game scores. 80-2 is the engine's best draftable five (README,
// scripts/search_best.ts, pinned by golden tests); the five itself is not published.

export const BEST_DRAFTABLE = "80-2";

export interface Answer { q: string; a: string }

export function bestFiveAnswer(): Answer {
  const r = evaluateLineup(getPlayersByIds(HERO_IDS), getCoefficients());
  const overload = r.factors.find((f) => f.label.startsWith("Usage overload"));
  const cost = overload ? `, and even that five gives back ${Math.abs(overload.value).toFixed(1)} points per 100 possessions to usage overload` : "";
  return {
    q: "What is the best all-time NBA starting five?",
    a: `There is no settled answer, but SweepSzn's engine gives a testable one: the best five anyone can draft projects ${BEST_DRAFTABLE} over an 82-game season. It is not simply the five biggest names. Stacking ball-dominant stars costs wins to usage overload, so the strongest fives are balanced two-way lineups with shooting and a real big. Curry, Jordan, LeBron, Giannis and Jokić, for example, project ${r.wins}-${r.losses}${cost}. The engine's own best five isn't published, so there is still something to chase.`,
  };
}

export function perfectSeasonAnswer(): Answer {
  return {
    q: "Can a team go 82-0?",
    a: `No real NBA team has. The best record in NBA history is 73-9, by the 2015-16 Golden State Warriors, one win ahead of the 72-10 Chicago Bulls of 1995-96. In SweepSzn, the best five anyone can draft projects ${BEST_DRAFTABLE}, which is also the engine's ceiling, so no lineup reaches 82-0. The game is how close you can get.`,
  };
}

export function recordAnswer(): Answer {
  const m = getEngineMeta();
  return {
    q: "How does SweepSzn calculate a lineup's record?",
    a: `Each player card has an offensive and a defensive rating: box-score impact over a minutes-weighted three-season window, normalized against that season's league. The engine adds up the five, applies lineup terms for spacing, usage, shot creation, interior size and perimeter defense, and gets a team offensive and defensive rating per 100 possessions. A Pythagorean formula (exponent about ${Math.round(m.pythK ?? 14)}) turns those into a win percentage over 82 games. The core coefficients are fit to ${m.team_seasons.toLocaleString("en-US")} real NBA team-seasons from 1985 to 2025, and predicting held-out real teams from their players' actual seasons, the model misses by about ${m.cv_wins_rmse.toFixed(1)} wins on average.`,
  };
}

export function bullsWarriorsAnswer(): Answer | null {
  const v = vsView("bulls-1996-vs-warriors-2016");
  if (!v) return null;
  return {
    q: "Who wins, the 1995-96 Bulls or the 2015-16 Warriors?",
    a: `${v.verdict} That is a fantasy simulation of each team's starting five as SweepSzn cards, not a replay of the real seasons (72-10 and 73-9). The head-to-head pages cover ${VS_MATCHUPS.length} famous matchups like it, each with the factors behind both records.`,
  };
}
