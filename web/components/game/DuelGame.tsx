"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import type { DraftCandidate, LineupResult, Player, Slot } from "@/lib/types";
import { SLOTS, teamName, eraLabel, displayName } from "@/lib/teams";
import { DEFAULT_PERSONA, DUEL_TURNS, PERSONAS, isPersona, newDuelSeed, personaInfo, type DuelOutcome, type Persona } from "@/lib/duel";
import { saveResult } from "@/lib/resultHistory";
import { pushResult } from "@/lib/account";
import { ev } from "@/lib/ev";
import { isoDay } from "@/lib/poolDate";
import { getUid } from "@/lib/streak";
import { scrollToTop } from "@/lib/scroll";
import { useSessionContext } from "@/components/SessionProvider";
import ResultSkeleton from "@/components/ResultSkeleton";
import DuelResult from "@/components/DuelResult";
import { Shell } from "@/components/game/Shell";
import { Reel } from "@/components/game/Reel";
import { Browser } from "@/components/game/browser";
import { Court, MiniRoster } from "@/components/game/court";
import { useDialogFocus } from "@/components/game/useDialogFocus";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";
import { EMPTY, type Roster, type Spin } from "@/components/game/gameState";
import { onlyOpenSlot } from "@/lib/placement";

// Draft Duel vs a bot (W4). Five rounds of shared Classic-style spins in snake order; the bot's picks
// come from /api/duel/bot-pick (server-only logic) and the duel is scored by /api/duel/result, which
// replays every pick. No re-spins, no hints, no fit grades (DESIGN.md §12, spec D8). Placements are
// final — the server replay seats each pick at the slot it was placed in.

const PERSONA_KEY = "szn_duel_persona";
const CLOCK_KEY = "szn_duel_clock";
const CLOCK_SECS = 20;
const YOU_TURNS = DUEL_TURNS.flatMap((side, t) => (side === "you" ? [t] : []));

type BotPick = { turn: number; round: number; slot: Slot; team: string; decade: string; fallback: boolean; player: DraftCandidate };
type DuelSpin = Spin & { fallback?: boolean };
type Side = { players: Player[]; result: LineupResult };
type Final = { persona: Persona; outcome: DuelOutcome; card: string; you: Side; bot: Side };

const postJson = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const reducedMotion = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
const wait = (ms: number) => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));
const openOf = (r: Roster) => SLOTS.filter((s) => !r[s]);
// the slot a pick lands in when the clock decides: its listed position if open, else the first open fit
const autoSlot = (c: DraftCandidate, open: Slot[]) => (open.includes(c.pos as Slot) && c.eligible.includes(c.pos as Slot) ? (c.pos as Slot) : SLOTS.find((s) => open.includes(s) && c.eligible.includes(s)) ?? null);

function readPref<T>(key: string, parse: (v: string | null) => T): T | null {
  try { return parse(localStorage.getItem(key)); } catch { return null; }
}
function writePref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode */ }
}

export function DuelGame({ onModeSelect }: { onModeSelect: () => void }) {
  const { user } = useSessionContext();
  const [phase, setPhase] = useState<"setup" | "draft" | "result">("setup");
  const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);
  const [clockOn, setClockOn] = useState(false);
  const [seed, setSeed] = useState("");
  const [you, setYou] = useState<Roster>(EMPTY);
  const [picks, setPicks] = useState<{ id: string; slot: Slot }[]>([]);
  const [bot, setBot] = useState<BotPick[]>([]);
  const [turn, setTurn] = useState<number | null>(null);
  const [current, setCurrent] = useState<DuelSpin | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState<"bot" | "score" | null>(null);
  const [selPlayer, setSelPlayer] = useState<DraftCandidate | null>(null);
  const [error, setError] = useState<{ msg: string; retry: () => void } | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const [left, setLeft] = useState(CLOCK_SECS);
  const genRef = useRef(0);
  // pool date pinned at begin() (Game.tsx's isoDay convention): every spin, bot-pick and result call
  // sends it, so a duel that crosses a release midnight uses one pool end to end
  const asOfRef = useRef("");
  // Game.start() already counted the duel the player opened; every later begin() counts its own play
  const playCountedRef = useRef(true);
  // retry closures call through this ref, so no callback has to reference itself (react-hooks/immutability)
  const retryRef = useRef<{ score: (s: string, ps: Persona, pk: { id: string; slot: Slot }[]) => void; spin: (s: string, t: number, yr: Roster, bp: BotPick[]) => void; advance: (s: string, ps: Persona, pk: { id: string; slot: Slot }[], yr: Roster) => void } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogFocus(selPlayer, sheetRef);

  // remembered per viewer (after mount: hydration-safe; async IIFE = the repo's set-state-in-effect idiom)
  useEffect(() => {
    (async () => {
      const p = readPref(PERSONA_KEY, (v) => (isPersona(v) ? v : null));
      if (p) setPersona(p);
      if (readPref(CLOCK_KEY, (v) => v === "1")) setClockOn(true);
    })();
  }, []);

  const score = useCallback(async (s: string, ps: Persona, pk: { id: string; slot: Slot }[]) => {
    const gen = genRef.current;
    setBusy("score"); setError(null);
    try {
      const r = await postJson("/api/duel/result", { seed: s, persona: ps, picks: pk, asOf: asOfRef.current });
      if (!r.ok) throw new Error("score failed");
      const d = (await r.json()) as Final;
      if (gen !== genRef.current) return;
      setFinal(d); setPhase("result");
      const saved = saveResult({ encoded: d.card, mode: "duel", wins: d.you.result.wins, losses: d.you.result.losses, grade: d.you.result.grade, outcome: d.outcome });
      if (user) void pushResult(saved);
      track("duel_complete", { persona: ps, outcome: d.outcome, wins: d.you.result.wins });
      if (typeof window !== "undefined") requestAnimationFrame(() => scrollToTop());
    } catch {
      if (gen === genRef.current) setError({ msg: "Couldn't score the duel.", retry: () => retryRef.current?.score(s, ps, pk) });
    } finally {
      if (gen === genRef.current) setBusy(null);
    }
  }, [user]);

  const loadSpin = useCallback(async (s: string, t: number, yr: Roster, bp: BotPick[]) => {
    const gen = genRef.current;
    setSpinning(true); setCurrent(null); setSelPlayer(null); setError(null); setTurn(t);
    try {
      const exclude = [...SLOTS.map((x) => yr[x]?.id).filter(Boolean), ...bp.map((b) => b.player.id)];
      const [r] = await Promise.all([postJson("/api/spin", { seed: s, round: t >> 1, exclude, open: openOf(yr), asOf: asOfRef.current }), wait(700)]);
      if (!r.ok) throw new Error("spin failed");
      const d = (await r.json()) as DuelSpin;
      if (gen !== genRef.current) return;
      setCurrent(d);
    } catch {
      if (gen === genRef.current) setError({ msg: "Network hiccup.", retry: () => retryRef.current?.spin(s, t, yr, bp) });
    } finally {
      if (gen === genRef.current) setSpinning(false);
    }
  }, []);

  // after each of your picks: the server replays the duel and plays the bot's turns up to yours
  const advance = useCallback(async (s: string, ps: Persona, pk: { id: string; slot: Slot }[], yr: Roster) => {
    const gen = genRef.current;
    setBusy("bot"); setError(null);
    try {
      const r = await postJson("/api/duel/bot-pick", { seed: s, persona: ps, picks: pk, asOf: asOfRef.current });
      if (!r.ok) throw new Error("bot failed");
      const d = (await r.json()) as { bot: BotPick[]; next: number | null };
      await wait(650); // a beat for the bot "on the clock"
      if (gen !== genRef.current) return;
      setBot(d.bot); setBusy(null);
      if (d.next === null) void score(s, ps, pk);
      else void loadSpin(s, d.next, yr, d.bot);
    } catch {
      if (gen === genRef.current) { setBusy(null); setError({ msg: "The bot lost connection.", retry: () => retryRef.current?.advance(s, ps, pk, yr) }); }
    }
  }, [loadSpin, score]);

  useEffect(() => { retryRef.current = { score, spin: loadSpin, advance }; }, [score, loadSpin, advance]);

  const begin = useCallback(() => {
    genRef.current += 1;
    if (!playCountedRef.current) ev("play", { uid: getUid(), mode: "duel" });
    playCountedRef.current = false;
    asOfRef.current = isoDay();
    const s = newDuelSeed();
    setSeed(s); setYou(EMPTY); setPicks([]); setBot([]); setFinal(null); setSelPlayer(null); setBusy(null);
    setPhase("draft");
    void loadSpin(s, 0, EMPTY, []);
  }, [loadSpin]);

  const placeWith = useCallback((c: DraftCandidate, slot: Slot) => {
    if (!current || busy || you[slot] || !c.eligible.includes(slot)) return;
    const nextYou = { ...you, [slot]: c };
    const nextPicks = [...picks, { id: c.id, slot }];
    setYou(nextYou); setPicks(nextPicks); setSelPlayer(null); setCurrent(null); setTurn(null);
    void advance(seed, persona, nextPicks, nextYou);
    if (typeof window !== "undefined") requestAnimationFrame(() => scrollToTop());
  }, [current, busy, you, picks, seed, persona, advance]);

  // optional pick clock: on expiry, auto-pick the top scorer who fits an open slot
  const placeRef = useRef(placeWith);
  useEffect(() => { placeRef.current = placeWith; }, [placeWith]);
  useEffect(() => {
    if (!clockOn || !current || phase !== "draft") return;
    const end = Date.now() + CLOCK_SECS * 1000;
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s > 0) return;
      clearInterval(id);
      const open = openOf(you);
      const best = [...current.candidates].filter((c) => autoSlot(c, open))
        .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))[0];
      if (best) placeRef.current(best, autoSlot(best, open)!);
    };
    const id = setInterval(tick, 250);
    const first = setTimeout(tick, 0);
    return () => { clearInterval(id); clearTimeout(first); };
  }, [clockOn, current, phase, you]);

  const choosePersona = (p: Persona) => { setPersona(p); writePref(PERSONA_KEY, p); };
  const toggleClock = () => { const v = !clockOn; setClockOn(v); writePref(CLOCK_KEY, v ? "1" : "0"); };

  const info = personaInfo(persona);

  if (phase === "setup") return (
    <div className="animate-rise-in mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <button onClick={onModeSelect} className="text-xs text-zinc-400 transition hover:text-zinc-200">← Modes</button>
      <h1 className="mt-3 font-display text-3xl tracking-tight sm:text-5xl">Draft Duel</h1>
      <p className="mt-2 text-zinc-400">
        Five rounds, one shared spin per round, snake order: you pick first in rounds 1, 3 and 5, the bot in 2 and 4.
        No re-spins. Both fives play all 82 games — the better record wins.
      </p>
      <fieldset className="mt-6">
        <legend className="text-xs font-bold uppercase tracking-widest text-zinc-500">Pick your opponent</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {PERSONAS.map((p) => {
            const on = p.key === persona;
            return (
              <label key={p.key}
                className={`flex cursor-pointer flex-col rounded-2xl border p-4 text-left transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange-500 ${
                  on ? "border-orange-500 bg-orange-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"}`}>
                <input type="radio" name="duel-persona" value={p.key} checked={on} onChange={() => choosePersona(p.key)} className="sr-only" />
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-zinc-100">{p.name}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">{p.level}</span>
                </span>
                <span className="mt-1 text-sm text-zinc-400">{p.blurb}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <input type="checkbox" checked={clockOn} onChange={toggleClock} className="mt-0.5 h-4 w-4 accent-orange-500" />
        <span className="text-sm">
          <span className="font-semibold text-zinc-200">{CLOCK_SECS}-second pick clock</span>
          <span className="block text-zinc-500">When time runs out you get the top scorer who fits an open slot.</span>
        </span>
      </label>
      <button onClick={begin}
        className="mt-6 w-full rounded-xl bg-orange-500 py-3 text-base font-black text-black transition hover:bg-orange-400 sm:w-auto sm:px-10">
        Duel {info.name} →
      </button>
    </div>
  );

  if (phase === "result" && final) return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <button onClick={onModeSelect} className="mb-3 text-xs text-zinc-400 transition hover:text-zinc-200">← Modes</button>
      <DuelResult persona={final.persona} outcome={final.outcome} you={final.you} bot={final.bot} card={final.card}
        onRematch={begin} onChangePersona={() => { genRef.current += 1; setPhase("setup"); }} />
    </div>
  );

  const filled = picks.length;
  const lastYouTurn = filled ? YOU_TURNS[filled - 1] : -1;
  const round = Math.min(5, ((turn ?? lastYouTurn + 1) >> 1) + 1);
  const open = openOf(you);
  const botRoster: Roster = { ...EMPTY };
  for (const b of bot) botRoster[b.slot] = b.player;
  // the bot's picks since your last one (it can pick twice in a row across a snake turn)
  const recentBot = bot.filter((b) => b.turn > lastYouTurn);
  const yourTurn = !!current && !busy;

  return (
    <Shell roundNum={round} mode="duel" onRestart={begin} onModeSelect={onModeSelect} showRestart={filled > 0}>
      {busy === "score" ? <ResultSkeleton label="Running both seasons…" /> : (
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(300px,380px)]">
        <div className="order-first min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2" role="status" aria-live="polite">
            <span className="text-sm font-bold text-zinc-200">
              {busy === "bot" ? `${info.name} is on the clock…` : yourTurn ? `Round ${round} of 5 · your pick` : spinning ? "Spinning…" : `Round ${round} of 5`}
            </span>
            <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">vs {info.name}</span>
          </div>
          {recentBot.map((b) => (
            <p key={b.turn} className="animate-rise-in mb-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-3 py-2 text-xs text-zinc-300">
              <span className="font-bold text-sky-300">{info.name}</span> took <span className="font-semibold text-zinc-100">{displayName(b.player.name)}</span> at {b.slot}
              <span className="text-zinc-500"> · {b.team} {eraLabel(b.decade)}{b.fallback ? " · fallback spin" : ""}</span>
            </p>
          ))}
          <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
            <Reel kind="TEAM" value={current?.team ?? "???"} sub={current ? teamName(current.team) : "team"} color="orange" spinning={spinning || !current} />
            <Reel kind="ERA" value={current ? eraLabel(current.decade) : "???"} sub="decade" color="violet" spinning={spinning || !current} />
          </div>
          {current?.fallback && (
            <p className="mb-2 text-center text-[11px] text-amber-400/90">Nobody left in the shared spin fits your open slots ({open.join("/")}) — you were dealt a fallback spin.</p>
          )}
          {clockOn && yourTurn && (
            <div className="mx-auto mb-3 max-w-sm" role="timer" aria-label={`${left} seconds left to pick`}>
              <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                <span>Pick clock</span><span className={`tabular-nums ${left <= 5 ? "text-red-400" : ""}`}>{left}s</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div className={`h-full motion-safe:transition-[width] motion-safe:duration-300 ${left <= 5 ? "bg-red-400" : "bg-orange-500"}`} style={{ width: `${(left / CLOCK_SECS) * 100}%` }} />
              </div>
            </div>
          )}
          <MiniRoster roster={you} />
          {current && !busy ? (
            <Browser key={`${current.team}|${current.decade}|${turn}`} spin={current} mode="duel" selId={selPlayer?.id ?? null}
              hintsLeft={0} onReveal={() => {}} canPlace={(c) => open.some((s) => c.eligible.includes(s))}
              onSelect={(c) => {
                // F25: one open slot he can play → place on the tap; otherwise choose the slot next
                const only = onlyOpenSlot(c, you);
                if (only) placeWith(c, only);
                else setSelPlayer((p) => (p?.id === c.id ? null : c));
              }} />
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              {error ? (
                <>
                  <p className="text-red-400">{error.msg}</p>
                  <button onClick={error.retry} className="mt-3 rounded-xl bg-orange-500 px-6 py-2.5 font-bold text-black hover:bg-orange-400">Try again</button>
                </>
              ) : busy === "bot" ? `${info.name} is drafting from the spin…` : "Dealing the spin…"}
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-zinc-400">Placements are final in a duel — choose the slot carefully.</p>
        </div>

        <div className="order-last min-w-0 space-y-4">
          <Court roster={you} selSlot={null} idle={false}
            isTarget={(s) => !!selPlayer && !you[s] && selPlayer.eligible.includes(s)}
            onSlot={(s) => { if (selPlayer) placeWith(selPlayer, s); }} />
          {selPlayer && (
            <p role="status" aria-live="polite" className="hidden text-center text-xs font-semibold text-orange-400 lg:block">
              Placing {displayName(selPlayer.name)} — choose a glowing position
            </p>
          )}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-sky-300">{info.name}&apos;s five</div>
            <ul className="mt-2 space-y-1 text-xs">
              {SLOTS.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-[10px] font-bold text-zinc-400">{s}</span>
                  {botRoster[s] ? <span className="truncate font-semibold text-zinc-200">{displayName(botRoster[s]!.name)} <span className="font-normal text-zinc-500">· {botRoster[s]!.team} {eraLabel(botRoster[s]!.decade)}</span></span>
                    : <span className="text-zinc-400">open</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      )}

      {selPlayer && (
        <div ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Choose a position"
          onKeyDown={(e) => buildFocusTrapHandler(sheetRef, () => setSelPlayer(null))(e)}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-700 bg-zinc-900/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] outline-none backdrop-blur lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-orange-400">Place {displayName(selPlayer.name)} — choose a position</span>
            <button onClick={() => setSelPlayer(null)} aria-label="Cancel" className="-my-2 -mr-1 grid min-h-11 min-w-11 shrink-0 place-items-center text-zinc-400 hover:text-zinc-200">✕</button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {SLOTS.map((s) => {
              const target = !you[s] && selPlayer.eligible.includes(s);
              return (
                <button key={s} disabled={!target} onClick={() => placeWith(selPlayer, s)}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-lg py-3 text-sm font-bold transition active:scale-95 ${target ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-400"}`}>
                  <span>{s}</span>{!target && <span className="text-[8px] font-semibold uppercase">{you[s] ? "Filled" : "N/A"}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Shell>
  );
}
