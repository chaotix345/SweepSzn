import { bestFiveAnswer, perfectSeasonAnswer, recordAnswer } from "@/lib/answers";
import { getEngineMeta } from "@/lib/receipts";
import { baseUrl } from "@/lib/site";
import { VS_MATCHUPS, matchupTitle, vsPath } from "@/lib/vs";

// /llms.txt (llmstxt.org): a plain-markdown map of the site for AI assistants and answer engines.
// Prerendered at build; every number comes from coefficients.json or the live engine, so it can't
// drift from what the game scores.
export const dynamic = "force-static";

function body(): string {
  const m = getEngineMeta();
  const u = (p: string) => `${baseUrl}${p}`;
  const qa = [bestFiveAnswer(), perfectSeasonAnswer(), recordAnswer()];
  return `# SweepSzn

> SweepSzn is a free browser game: draft an all-time NBA starting five from spinning team and era reels, and an engine simulates its 82-game season and explains why it wins or loses. The engine's core is fit to ${m.team_seasons.toLocaleString("en-US")} real NBA team-seasons (1985-2025).

No account is needed. The engine models finite possessions and usage overload, era normalization (each stat is z-scored against its own season's league, and pre-1985 dominance is discounted), defense at close to equal weight with offense, floor spacing, shot creation, interior size and perimeter defense. Every result lists the factors that helped and hurt, with their cost in wins. Predicting held-out real teams from their players' actual seasons, the team model misses by about ${m.cv_wins_rmse.toFixed(1)} wins on average (luck-adjusted, year-grouped cross-validation); the card ratings, tested from each player's other seasons only, miss by about ${(m.track_b_cv ?? 0).toFixed(1)}. Lineup penalties for shapes real teams never field are reasoned rather than fitted, and the site says which is which.

## Key pages

- [Play](${u("/play")}): draft a five in Daily, Classic, HoopIQ, Prime Draft, Factor Hunt, Blueprint, Surgeon or Challenge mode, or draft against a bot in Draft Duel
- [How it works](${u("/how-it-works")}): what the engine models, straight answers, and the public accuracy receipts
- [About](${u("/about")}): what SweepSzn is, with an FAQ
- [All-time fives for every NBA franchise](${u("/teams")}): 30 franchise pages, each five picked by career accolades and scored by the engine
- [Head-to-head matchups](${u("/vs")}): famous real starting fives scored side by side (fantasy simulations)
- [Leaderboards](${u("/leaderboards")}): Daily, Weekly and All-time boards

## Game modes

- Daily: the same spins for everyone each day, with a shared leaderboard
- Classic: free play with a few hints
- HoopIQ: player stats hidden, so you draft from memory
- Prime Draft: each franchise's all-time peak pool
- Factor Hunt: predict why a lineup wins before the reveal
- Blueprint: commit to a tactic, then draft to prove it
- Surgeon: make one swap to fix your five's worst factor
- Challenge a Friend: head-to-head on the same draft
- Draft Duel: a snake draft against a bot from the same spins, at three difficulty levels

## Straight answers

${qa.map((a) => `### ${a.q}\n\n${a.a}`).join("\n\n")}

## Head-to-head matchups

Each side is a real team's starting five as SweepSzn cards (a card is the player's season with that franchise in that decade). The engine projects each five's 82-game record separately; these are fantasy simulations, not the real-team calibration.

${VS_MATCHUPS.map((v) => `- [${matchupTitle(v)}](${u(vsPath(v.slug))}): ${v.blurb}`).join("\n")}
`;
}

export function GET() {
  return new Response(body(), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
