"use client";
import Link from "next/link";
import type { LineupResult, Player } from "@/lib/types";
import { SLOTS, teamColors, initials, eraLabel, displayName } from "@/lib/teams";
import { gradeColor } from "@/lib/grades";
import { fmtNet } from "@/lib/explain";
import { avgZ } from "@/lib/radar";
import { personaInfo, type DuelOutcome, type Persona } from "@/lib/duel";
import { RecordPill } from "@/components/game/CompareLineup";
import { ZRadar } from "@/components/game/ZRadar";
import { ShareButton, SaveCardImage } from "@/components/ResultCard";

// Draft Duel head-to-head: your five vs the bot's, both scored by the engine. Everything here is
// post-commit (both fives are locked), so full transparency is fair (DESIGN.md §12). Used by the
// in-game reveal and the /duel/ permalink (shared), like SurgeonResult is for Surgeon.

const YOU = "#ff6a00";
const BOT = "#38bdf8";
type Side = { players: Player[]; result: LineupResult };

export function duelVerdict(outcome: DuelOutcome, persona: Persona, you: LineupResult, bot: LineupResult, shared = false) {
  const name = personaInfo(persona).name;
  const wins = Math.abs(you.wins - bot.wins);
  const by = wins ? `by ${wins} ${wins === 1 ? "win" : "wins"}` : `on net rating (${fmtNet(you.netRtg - bot.netRtg)})`;
  return outcome === "w" ? { head: `${shared ? "Player" : "You"} beat ${name}`, sub: by, cls: "text-green-400" }
    : outcome === "l" ? { head: `${name} wins`, sub: by, cls: "text-red-400" }
    : { head: "Dead even", sub: "same record, same net rating", cls: "text-zinc-200" };
}

export function duelShareText(outcome: DuelOutcome, persona: Persona, you: LineupResult, bot: LineupResult): string {
  const name = personaInfo(persona).name;
  const score = `${you.wins}-${you.losses} to ${bot.wins}-${bot.losses}`;
  return outcome === "w" ? `I beat ${name} in a SweepSzn Draft Duel — my all-time five went ${score}. Think you can take the bot?`
    : outcome === "l" ? `${name} beat me in a SweepSzn Draft Duel — ${score}. Can you take the bot down?`
    : `Dead heat with ${name} in a SweepSzn Draft Duel — ${score}. Can you break the tie?`;
}

function FiveList({ players }: { players: Player[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {players.map((p, i) => {
        const c = teamColors(p.team);
        return (
          <li key={p.id} className="flex min-w-0 items-center gap-2 text-xs">
            <span className="w-6 shrink-0 text-[10px] font-bold text-zinc-500">{SLOTS[i]}</span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-black" style={{ background: c.bg, color: c.text }}>{initials(p.name)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{displayName(p.name)}</span>
            <span className="shrink-0 text-[10px] text-zinc-500">{p.team} · {eraLabel(p.decade)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SideCard({ tag, side, color }: { tag: string; side: Side; color: string }) {
  const r = side.result;
  return (
    <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />{tag}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-4xl tabular-nums text-zinc-100">{r.wins}<span className="text-zinc-600">–</span>{r.losses}</span>
        <span className={`text-sm font-bold ${gradeColor(r.grade)}`}>{r.grade}</span>
      </div>
      <div className="text-[11px] tabular-nums text-zinc-500">
        ORtg {r.ortg.toFixed(1)} · DRtg {r.drtg.toFixed(1)} · Net <span className={r.netRtg >= 0 ? "text-green-400" : "text-red-400"}>{fmtNet(r.netRtg)}</span>
      </div>
      <FiveList players={side.players} />
    </div>
  );
}

export default function DuelResult({ persona, outcome, you, bot, card, shared, onRematch, onChangePersona }: {
  persona: Persona; outcome: DuelOutcome; you: Side; bot: Side; card: string; shared?: boolean;
  onRematch?: () => void; onChangePersona?: () => void;
}) {
  const info = personaInfo(persona);
  const v = duelVerdict(outcome, persona, you.result, bot.result, shared);
  const path = `/duel/${card}`;
  return (
    <div className="animate-rise-in overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 px-5 pt-6 pb-5 text-center">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Draft Duel · vs {info.name} ({info.level})</div>
        <div className={`animate-record-slam mt-1 font-display text-5xl sm:text-6xl ${v.cls}`}>{v.head}</div>
        <div className="mt-1 text-sm text-zinc-400">{v.sub}</div>
        <div className="mx-auto mt-4 grid max-w-xs grid-cols-2 gap-2 text-center">
          <RecordPill label={shared ? "Player" : "You"} wins={you.result.wins} losses={you.result.losses} grade={you.result.grade} />
          <RecordPill label={info.name} wins={bot.result.wins} losses={bot.result.losses} grade={bot.result.grade} />
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
        <SideCard tag={shared ? "Player's five" : "Your five"} side={you} color={YOU} />
        <SideCard tag={`${info.name}'s five`} side={bot} color={BOT} />
      </div>

      <div className="border-t border-zinc-800 px-4 py-4">
        <div className="flex justify-center">
          <ZRadar players={[
            { label: shared ? "Player" : "You", z: avgZ(you.players), color: YOU },
            { label: info.name, z: avgZ(bot.players), color: BOT },
          ]} />
        </div>
        <p className="mt-1 text-center text-[10px] text-zinc-400">Each five&apos;s era-relative profile — descriptive, not a fit rating.</p>
      </div>

      <div className="border-t border-zinc-800 px-4 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <ShareButton result={you.result} path={path} names={you.players.map((p) => displayName(p.name))}
            text={duelShareText(outcome, persona, you.result, bot.result)} />
          {shared ? (
            <Link href="/play?mode=duel" className="flex-1 rounded-xl bg-orange-500 py-2.5 text-center text-sm font-bold text-black hover:bg-orange-400">Duel the bot →</Link>
          ) : (
            <button onClick={onRematch} className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-black hover:bg-orange-400">Rematch {info.name}</button>
          )}
        </div>
        {!shared && onChangePersona && (
          <button onClick={onChangePersona} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500">Change opponent</button>
        )}
        <SaveCardImage path={path} />
      </div>
    </div>
  );
}
