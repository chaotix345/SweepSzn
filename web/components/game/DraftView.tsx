"use client";
import { useRef } from "react";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";
import type { Mode } from "@/components/game/types";
import { Reel } from "@/components/game/Reel";
import { UsageBar, SkipBtn } from "@/components/game/controls";
import { Court, MiniRoster } from "@/components/game/court";
import { Browser } from "@/components/game/browser";
import { ProjectionMeter } from "@/components/game/ProjectionMeter";
import { LeversTip } from "@/components/game/LeversTip";
import { useDialogFocus } from "@/components/game/useDialogFocus";
import type { DraftCandidate, Slot } from "@/lib/types";
import { SLOTS, teamName, displayName } from "@/lib/teams";
import { BLUEPRINTS, type BlueprintKey } from "@/lib/blueprint";
import type { RosterProjection } from "@/lib/projection";
import { HINT_BUDGET, type Roster, type Spin } from "@/components/game/gameState";
import type { ReelValue } from "@/components/game/useReelSpin";

// The draft phase: reels + controls (left column on desktop), the candidate browser, the court
// (right rail on desktop), and the mobile "choose position" sheet.
export function DraftView(p: {
  mode: Mode;
  roster: Roster;
  current: Spin | null;
  reel: ReelValue;
  lockedReel: "team" | "era" | null;
  spinning: boolean;
  blueprint: BlueprintKey | null;
  projAllowed: boolean;
  prime?: boolean; // Prime Draft, or a challenge replaying a Prime seed
  projection: RosterProjection | null;
  skips: { team: boolean; era: boolean };
  selPlayer: DraftCandidate | null;
  selSlot: Slot | null;
  hintsUsed: number;
  crowdNote: string | null;
  error: string | null;
  loading: boolean;
  fhFetching: boolean;
  onSpin: () => void;
  onReSpinTeam: () => void;
  onReSpinEra: () => void;
  onRevealHint: () => void;
  onSelectCandidate: (c: DraftCandidate) => void;
  onFinish: () => void;
  onRestart: () => void;
  onSlot: (s: Slot) => void;
  slotTarget: (s: Slot) => boolean;
  onCancelSelection: () => void;
}) {
  const { mode, roster, current, reel, lockedReel, spinning, blueprint, skips, selPlayer, selSlot } = p;
  const prime = mode === "prime" || !!p.prime;
  const sheetRef = useRef<HTMLDivElement>(null); // mobile "choose position" dialog
  // move keyboard focus into the mobile position sheet when it opens, and restore it to the
  // triggering element when it closes (paired with the Tab trap in the sheet's onKeyDown below)
  useDialogFocus(selPlayer ?? selSlot, sheetRef);

  const drafted = SLOTS.map((s) => roster[s]).filter(Boolean) as DraftCandidate[];
  const filled = drafted.length;
  const allFilled = filled === 5;
  const roundNum = Math.min(filled + 1, 5);
  const openSlots = SLOTS.filter((s) => !roster[s]);
  const canPlaceAny = current ? current.candidates.some((c) => openSlots.some((s) => c.eligible.includes(s))) : true;
  const hideIQ = mode === "hoopiq";
  const reelMasked = (locked: boolean) => hideIQ && !(spinning && !locked);
  const idle = !current && !spinning; // between spins: the reels show nothing real yet
  // Live usage budget: shown from the very first pick in every stats-visible mode so the cap's
  // EXISTENCE is disclosed before the anchor pick — not sprung at round 3, after the two most
  // consequential picks. It reads an empty "0% / budget" at the start, then fills live as players
  // are placed; USAGE DISCIPLINE adds its A+/A grade lines. HoopIQ stays bar-free (its premise is
  // drafting blind). Usage is intrinsic public player data, not a seed-relative hint, so competitive
  // seeds are unaffected (DESIGN.md §12).
  const discBar = mode === "blueprint" && blueprint === "discipline";
  const showUsageBar = discBar || !hideIQ;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(300px,380px)]">
        {/* Desktop: the reels + controls fold into the LEFT column so the sticky court becomes a right
            rail spanning from the top (no dead space top-right). Mobile is single-column, so the DOM
            order is unchanged: reels → controls → roster → browser → court. min-w-0 on both columns
            (F01): a grid item's min-content would otherwise push the page sideways on a 375px phone. */}
        <div className="order-first min-w-0">
          {/* reels + draft controls */}
          <div className="mb-5">
            {/* reels. Idle (no spin yet this round) they read neutral "?" — never a fake team/era, and
                never the previous round's spin (F03). Prime's era reel is fixed by design. */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Reel kind="TEAM" value={idle ? "?" : reel.team} sub={idle ? "spin to reveal" : teamName(reel.team)} color="orange" locked={lockedReel === "team"} masked={reelMasked(lockedReel === "team")} spinning={spinning || !current} />
              <Reel kind="ERA" value={idle && !prime ? "?" : reel.era} sub={prime ? "best w/ franchise" : idle ? "spin to reveal" : "decade"} color="violet" prime={prime}
                locked={!prime && lockedReel === "era"} masked={reelMasked(lockedReel === "era")} spinning={!prime && (spinning || !current)} />
              {/* the one Spin button (F03): right under the reels on phones, beside them on desktop */}
              {!current && !allFilled && (
                <button onClick={p.onSpin} disabled={spinning}
                  className="min-h-12 w-full max-w-xs rounded-xl bg-orange-500 px-7 py-3 text-base font-black text-black shadow-lg transition hover:bg-orange-400 disabled:opacity-50 sm:w-auto">
                  {spinning ? "Spinning…" : "🎰 SPIN"}
                </button>
              )}
            </div>
            {!current && !allFilled && p.crowdNote && (
              <p className="mt-2 text-center text-xs text-zinc-400"><span className="text-violet-300" aria-hidden>◆</span> {p.crowdNote}</p>
            )}
            {!current && !allFilled && p.error && <p role="alert" className="mt-2 text-center text-xs text-red-400">{p.error}</p>}
            {hideIQ && (
              <p className="mt-2 text-center text-[11px] text-zinc-400">🧠 Team &amp; era hidden — draft by recognizing the players.</p>
            )}
            {prime && (
              <p className="mt-2 text-center text-[11px] text-zinc-400">⚡ Fantasy simulation, not historical — every legend in his best season with that franchise, any era.</p>
            )}
            {mode === "blueprint" && blueprint && (
              <p className="mt-2 text-center text-[11px] text-cyan-400/80">📐 Committed: {BLUEPRINTS.find((b) => b.key === blueprint)!.label} — the engine grades your execution.</p>
            )}
            {mode === "surgeon" && (
              <p className="mt-2 text-center text-[11px] text-rose-400/80">🩺 Draft five — then the engine diagnoses your worst factor and deals one fix.</p>
            )}
            {/* Skipped where it would conflict or duplicate — HoopIQ is deliberately blind, Blueprint has
                its own objective dialog, Surgeon's diagnosis step teaches the same vocab. */}
            {mode !== "hoopiq" && mode !== "blueprint" && mode !== "surgeon" && <LeversTip />}
            {/* USAGE DISCIPLINE drafts to a non-obvious budget — the live bar is the spec's fix.
                Everywhere else the bar pre-explains the engine's dominant penalty (see showUsageBar). */}
            {showUsageBar && <UsageBar total={drafted.reduce((a, c) => a + (c.usage ?? 0), 0)} discipline={discBar} />}
            {p.projAllowed && !allFilled && filled >= 1 && p.projection?.floor && <ProjectionMeter projection={p.projection} />}
            {(current || spinning) && (
              <div className="mt-2 flex justify-center gap-2 text-xs">
                <SkipBtn label="↻ Re-spin Team" used={skips.team} onClick={p.onReSpinTeam} disabled={spinning} />
                {/* the era reel is hard-locked to PRIME in Prime Draft — no era re-spin to offer */}
                {!prime && <SkipBtn label="↻ Re-spin Era" used={skips.era} onClick={p.onReSpinEra} disabled={spinning} />}
              </div>
            )}
          </div>
          {/* mobile: your five at a glance, directly above the candidates (the half-court is below the fold) */}
          <MiniRoster roster={roster} maskColors={hideIQ} />
          {current ? (
            <Browser key={`${current.team}|${current.decade}|${roundNum}`} spin={current} mode={mode} selId={selPlayer?.id ?? null}
              hintsLeft={Math.max(0, HINT_BUDGET - p.hintsUsed)} onReveal={p.onRevealHint}
              showUsage={mode === "blueprint" && blueprint === "discipline"}
              canPlace={(c) => openSlots.some((s) => c.eligible.includes(s))}
              onSelect={p.onSelectCandidate} />
          ) : allFilled ? (
            <div className="animate-rise-in rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
              <p className="mb-3 text-sm text-zinc-400">Your starting five is set.</p>
              <button onClick={p.onFinish} disabled={p.loading || p.fhFetching}
                className="min-h-11 rounded-xl bg-orange-500 px-6 py-2.5 font-bold text-black hover:bg-orange-400 disabled:opacity-50">
                {p.fhFetching ? "Building your question…" : mode === "factorhunt" ? "Lock Five → Predict" : mode === "surgeon" ? "Lock Five → Diagnose" : "Simulate Season"}
              </button>
              {p.error && <p className="mt-3 text-xs text-red-400">{p.error}</p>}
            </div>
          ) : null}
          {current && !canPlaceAny && (
            <div className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-center text-xs text-amber-400">
              No one here fits your open slot ({openSlots.join("/")}).{" "}
              {/* a plain spin is deterministic in (seed, round, salt) — it would deal this same dead end —
                  so offer what can change it: an unused re-spin, else a restart */}
              {!skips.team ? <button onClick={p.onReSpinTeam} className="font-bold underline">Re-spin the team</button>
                : !prime && !skips.era ? <button onClick={p.onReSpinEra} className="font-bold underline">Re-spin the era</button>
                : <>Out of re-spins — <button onClick={p.onRestart} className="font-bold underline">restart</button></>}
            </div>
          )}
        </div>

        {/* court (below candidates on mobile, right on desktop) */}
        <div className="order-last min-w-0">
          <Court roster={roster} selSlot={selSlot} isTarget={p.slotTarget} onSlot={p.onSlot} maskColors={hideIQ} idle={!selPlayer && !selSlot} />
          {selPlayer && (
            <p role="status" aria-live="polite" className="mt-2 hidden text-center text-xs font-semibold text-orange-400 lg:block">
              Placing {displayName(selPlayer.name)} — choose a glowing position
            </p>
          )}
          {selSlot && (
            <p role="status" aria-live="polite" className="mt-2 hidden text-center text-xs font-semibold text-orange-400 lg:block">
              Moving {displayName(roster[selSlot]!.name)} — choose a glowing slot to swap
            </p>
          )}
        </div>
      </div>

      {/* mobile "choose position" sheet (82-0 parity) */}
      {(selPlayer || selSlot) && (
        <div ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Choose a position"
          onKeyDown={(e) => buildFocusTrapHandler(sheetRef, p.onCancelSelection)(e)}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-700 bg-zinc-900/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] outline-none backdrop-blur lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-orange-400" role="status" aria-live="polite">
              {selPlayer ? `Place ${displayName(selPlayer.name)} — choose a position` : `Move ${displayName(roster[selSlot!]!.name)}`}
            </span>
            <button onClick={p.onCancelSelection} aria-label="Cancel" className="-my-2 -mr-1 grid min-h-11 min-w-11 shrink-0 place-items-center text-zinc-400 hover:text-zinc-200">✕</button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {SLOTS.map((s) => {
              const occupied = !!roster[s];
              const target = p.slotTarget(s);
              const tag = selPlayer ? (occupied ? "Filled" : target ? "" : "N/A") : target ? "swap" : occupied && s === selSlot ? "here" : "";
              return (
                <button key={s} disabled={!target} onClick={() => p.onSlot(s)}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-lg py-3 text-sm font-bold transition active:scale-95 ${
                    target ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-400"}`}>
                  <span>{s}</span>{tag && <span className="text-[8px] font-semibold uppercase">{tag}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
