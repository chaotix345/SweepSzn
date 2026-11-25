import { SLOTS } from "@/lib/teams";
import type { DraftCandidate, Slot } from "@/lib/types";
import type { Persona } from "@/lib/duel";

type Post = (path: string, body: unknown) => Promise<Response>;
type BotPick = { turn: number; slot: Slot; player: DraftCandidate };

// Drive a whole duel through the real routes, like the client does: spin your deal (all taken ids +
// your open slots), pick the first candidate that fits, then let /api/duel/bot-pick advance the bot.
export async function playDuelViaRoutes(post: Post, seed: string, persona: Persona) {
  const picks: { id: string; slot: Slot }[] = [];
  const you: Partial<Record<Slot, string>> = {};
  let bot: BotPick[] = [];
  let next: number | null = 0;
  while (next !== null) {
    const open = SLOTS.filter((s) => !you[s]);
    const exclude = [...picks.map((p) => p.id), ...bot.map((b) => b.player.id)];
    const spin = (await (await post("/api/spin", { seed, round: next >> 1, exclude, open })).json()) as { candidates: DraftCandidate[] };
    const c = spin.candidates.find((x) => x.eligible.some((s) => open.includes(s)))!;
    const slot = c.eligible.find((s) => open.includes(s))!;
    picks.push({ id: c.id, slot }); you[slot] = c.id;
    const res = await post("/api/duel/bot-pick", { seed, persona, picks });
    const d = (await res.json()) as { bot: BotPick[]; next: number | null };
    if (res.status !== 200) throw new Error(`bot-pick ${res.status}: ${JSON.stringify(d)}`);
    bot = d.bot; next = d.next;
  }
  return { picks, bot };
}
