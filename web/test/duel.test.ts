import { describe, it, expect } from "vitest";
import { duelDeal, duelSpin, marginalNet, getCoefficients, getPlayersByIds } from "@/lib/data";
import { botChoose, chooseSlot, replayDuel, parsePicks, openSlots, resolveDuelCard, type DuelPick, type DuelRoster } from "@/lib/duelBot";
import { DUEL_TURNS, turnRound, encodeDuelCard, decodeDuelCard, isDuelSeed, outcomeFromWinner, PERSONAS } from "@/lib/duel";
import { SLOTS } from "@/lib/teams";
import type { Player, Slot } from "@/lib/types";

const elig = (p: { eligible?: Slot[]; pos: string }) => (p.eligible?.length ? p.eligible : [p.pos as Slot]);
const empty = (): DuelRoster => ({ PG: null, SG: null, SF: null, PF: null, C: null });

function mk(id: string, o: Partial<Player>): Player {
  return { id, person_id: id, name: id, year: 2015, decade: "2010s", tier: "complete", team: "BOS", pos: "SF", eligible: ["SF"], g: 70, mp: 30, obpm: 0, dbpm: 0, usg: 20, pts: 10, trb: 5, ast: 3, stl: 1, blk: 0.5, ...o } as Player;
}

// Play a whole duel with a fixed human strategy: first eligible candidate in board order, first open slot.
function playOut(seed: string, persona: (typeof PERSONAS)[number]["key"]): { picks: DuelPick[]; replay: ReturnType<typeof replayDuel> } {
  const picks: DuelPick[] = [];
  for (;;) {
    const r = replayDuel(seed, persona, picks);
    if (!r.ok || r.next === null) return { picks, replay: r };
    const taken = r.turns.map((t) => t.player.id);
    const open = openSlots(r.you);
    const deal = duelDeal(seed, turnRound(r.next), taken, open);
    const p = deal.pool.find((x) => elig(x).some((s) => open.includes(s)))!;
    picks.push({ id: p.id, slot: elig(p).find((s) => open.includes(s))! });
  }
}

describe("duel helpers", () => {
  it("snake order: R1 you→bot, R2 bot→you, R3 you→bot, R4 bot→you, R5 you→bot", () => {
    expect(DUEL_TURNS).toEqual(["you", "bot", "bot", "you", "you", "bot", "bot", "you", "you", "bot"]);
    expect(DUEL_TURNS.map((_, t) => turnRound(t))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("card round-trips and rejects malformed segments", () => {
    const you = ["a1", "a2", "a3", "a4", "a5"], bot = ["b1", "b2", "b3", "b4", "b5"];
    const card = encodeDuelCard("analyst", you, bot);
    expect(card).toBe("da~a1,a2,a3,a4,a5.b1,b2,b3,b4,b5");
    expect(decodeDuelCard(card)).toEqual({ persona: "analyst", youIds: you, botIds: bot });
    expect(decodeDuelCard("dz~a1,a2,a3,a4,a5.b1,b2,b3,b4,b5")).toBeNull();
    expect(decodeDuelCard("da~a1,a2,a3,a4.b1,b2,b3,b4,b5")).toBeNull();
    expect(decodeDuelCard("a1,a2,a3,a4,a5")).toBeNull();
  });

  it("seed and outcome helpers", () => {
    expect(isDuelSeed("duel-abc123")).toBe(true);
    expect(isDuelSeed("classic-1")).toBe(false);
    expect(isDuelSeed("duel-")).toBe(false);
    expect(outcomeFromWinner("a")).toBe("w");
    expect(outcomeFromWinner("b")).toBe("l");
    expect(outcomeFromWinner("tie")).toBe("t");
  });

  it("parsePicks accepts only ≤5 well-formed {id, slot} entries", () => {
    expect(parsePicks([{ id: "x_1", slot: "PG" }])).toEqual([{ id: "x_1", slot: "PG" }]);
    expect(parsePicks([{ id: "x", slot: "G" }])).toBeNull();
    expect(parsePicks([{ id: "X!", slot: "PG" }])).toBeNull();
    expect(parsePicks(Array.from({ length: 6 }, () => ({ id: "x", slot: "PG" })))).toBeNull();
    expect(parsePicks("nope")).toBeNull();
  });
});

describe("persona choice logic", () => {
  const scorer = mk("scorer", { pts: 32, trb: 4, ast: 4, blk: 0.2, year: 2018, eligible: ["SG"], pos: "SG" });
  const oldBig = mk("oldbig", { pts: 18, trb: 14, ast: 2, blk: 2.8, year: 1975, decade: "1970s", eligible: ["C"], pos: "C", fame: 20 });
  const glue = mk("glue", { pts: 8, trb: 6, ast: 3, blk: 1, eligible: ["PF"], pos: "PF" });

  it("Box-Score Bro takes the biggest box score", () => {
    expect(botChoose("bro", [glue, oldBig, scorer], empty())!.player.id).toBe("scorer");
  });

  it("Old Head leans pre-1990 bigs and rim protection over a modern scorer", () => {
    expect(botChoose("oldhead", [glue, oldBig, scorer], empty())!.player.id).toBe("oldbig");
  });

  it("The Analyst takes the best marginal net rating on this spin", () => {
    const pool = getPlayersByIds(duelDeal("duel-analyst1", 0, [], [...SLOTS]).pool.map((p) => p.id));
    const d = marginalNet([], pool, getCoefficients());
    const best = Math.max(...pool.map((p) => d.get(p.id)!));
    const pick = botChoose("analyst", pool, empty())!;
    expect(d.get(pick.player.id)).toBe(best);
  });

  it("every persona picks only players who fit an open slot, seated at that slot", () => {
    const r = empty();
    r.SG = mk("x", {}); r.SF = mk("y", {}); r.PF = mk("z", {}); r.C = mk("w", {});
    const pg = mk("pg", { pts: 3, eligible: ["PG"], pos: "PG" });
    for (const { key } of PERSONAS) {
      const c = botChoose(key, [scorer, oldBig, glue, pg], r)!;
      expect(c.player.id).toBe("pg");
      expect(c.slot).toBe("PG");
    }
    expect(botChoose("bro", [scorer, oldBig], r)).toBeNull();
  });

  it("chooseSlot prefers the listed position, else the first open eligible slot", () => {
    const swing = mk("s", { pos: "SF", eligible: ["SG", "SF"] });
    expect(chooseSlot(swing, ["SG", "SF"])).toBe("SF");
    expect(chooseSlot(swing, ["PG", "SG"])).toBe("SG");
    expect(chooseSlot(swing, ["C"])).toBeNull();
  });
});

describe("duel deal + guard", () => {
  it("both sides see the same round spin; taken players (and their other variants) drop out", () => {
    const a = duelDeal("duel-same1", 2, [], [...SLOTS]);
    const first = a.pool[0];
    const b = duelDeal("duel-same1", 2, [first.id], [...SLOTS]);
    expect([b.team, b.decade]).toEqual([a.team, a.decade]);
    expect(b.pool.some((p) => (p.person_id ?? p.id) === (first.person_id ?? first.id))).toBe(false);
  });

  it("re-deals from a deterministic fallback spin when a side has nobody for its open slots", () => {
    const base = duelDeal("duel-guard1", 1, [], [...SLOTS]);
    const centers = base.pool.filter((p) => elig(p).includes("C")).map((p) => p.id);
    expect(centers.length).toBeGreaterThan(0);
    // take every center in the shared spin: a side with only C open must be re-dealt
    const taken = centers;
    const g1 = duelDeal("duel-guard1", 1, taken, ["C"]);
    const g2 = duelDeal("duel-guard1", 1, taken, ["C"]);
    expect(g1.pool.some((p) => elig(p).includes("C"))).toBe(true);
    expect(g1.fallback).toBe(true);
    expect(g1.pool.some((p) => taken.includes(p.id))).toBe(false);
    expect([g1.team, g1.decade, g1.pool.map((p) => p.id)]).toEqual([g2.team, g2.decade, g2.pool.map((p) => p.id)]);
  });

  it("duelSpin never carries fit grades", () => {
    const s = duelSpin("duel-nofit", 0, [], [...SLOTS]);
    expect(s.candidates.length).toBeGreaterThan(0);
    expect(s.candidates.every((c) => c.fit == null)).toBe(true);
  });
});

describe("replayDuel", () => {
  it("plays a full duel for every persona: 5 v 5, ten distinct people, deterministic", () => {
    for (const { key } of PERSONAS) {
      const { picks, replay } = playOut(`duel-full${key}`, key);
      expect(replay.ok).toBe(true);
      if (!replay.ok) return;
      expect(replay.next).toBeNull();
      expect(picks).toHaveLength(5);
      expect(SLOTS.every((s) => replay.you[s] && replay.bot[s])).toBe(true);
      const people = replay.turns.map((t) => t.player.person_id ?? t.player.id);
      expect(new Set(people).size).toBe(10);
      expect(replay.turns.map((t) => t.side)).toEqual(DUEL_TURNS);
      const again = replayDuel(`duel-full${key}`, key, picks);
      expect(again.ok && again.turns.map((t) => t.player.id)).toEqual(replay.turns.map((t) => t.player.id));
    }
  });

  it("stops at your next turn, having auto-played the bot's turns", () => {
    const { picks } = playOut("duel-stop1", "bro");
    const r = replayDuel("duel-stop1", "bro", picks.slice(0, 1));
    expect(r.ok && r.next).toBe(3); // R1 you, R1 bot, R2 bot → your R2 pick
    expect(r.ok && r.turns.map((t) => t.side)).toEqual(["you", "bot", "bot"]);
  });

  it("rejects a player who isn't in your spin, a filled slot, an ineligible slot and extra picks", () => {
    const { picks } = playOut("duel-bad1", "oldhead");
    const deal0 = duelDeal("duel-bad1", 0, [], [...SLOTS]);
    const outsider = deal0.pool.length ? "zz_not_a_player" : "";
    expect(replayDuel("duel-bad1", "oldhead", [{ id: outsider, slot: "PG" }]).ok).toBe(false);

    const p0 = deal0.pool[0];
    const bad = SLOTS.find((s) => !elig(p0).includes(s));
    if (bad) expect(replayDuel("duel-bad1", "oldhead", [{ id: p0.id, slot: bad }]).ok).toBe(false);

    const dupSlot = [picks[0], { ...picks[1], slot: picks[0].slot }];
    expect(replayDuel("duel-bad1", "oldhead", dupSlot).ok).toBe(false);

    // picking a player the bot already took (or your own earlier pick) is "not in your spin"
    const r1 = replayDuel("duel-bad1", "oldhead", picks.slice(0, 1));
    const botTook = r1.ok ? r1.turns.find((t) => t.side === "bot")!.player : null;
    expect(replayDuel("duel-bad1", "oldhead", [picks[0], { id: botTook!.id, slot: openSlots(r1.ok ? r1.you : empty())[0] }]).ok).toBe(false);

    expect(replayDuel("duel-bad1", "oldhead", [...picks, picks[0]]).ok).toBe(false);
  });
});

describe("resolveDuelCard", () => {
  it("rebuilds a played duel from its card with the same verdict the result route gives", () => {
    const { replay } = playOut("duel-card1", "analyst");
    if (!replay.ok) throw new Error("replay failed");
    const you = SLOTS.map((s) => replay.you[s]!.id), bot = SLOTS.map((s) => replay.bot[s]!.id);
    const d = resolveDuelCard(encodeDuelCard("analyst", you, bot))!;
    expect(d.persona).toBe("analyst");
    expect(d.you.players.map((p) => p.id)).toEqual(you);
    const w = d.you.result.wins - d.bot.result.wins;
    expect(d.outcome).toBe(w > 0 ? "w" : w < 0 ? "l" : d.you.result.netRtg > d.bot.result.netRtg ? "w" : d.you.result.netRtg < d.bot.result.netRtg ? "l" : "t");
    expect(resolveDuelCard(encodeDuelCard("analyst", you, [you[0], ...bot.slice(1)]))).toBeNull();
    expect(resolveDuelCard("nope")).toBeNull();
  });
});
